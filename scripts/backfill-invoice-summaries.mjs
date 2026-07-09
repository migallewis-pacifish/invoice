#!/usr/bin/env node
/**
 * Backfills company-level invoice summaries from client invoice subcollections.
 *
 * Usage:
 *   npm install --no-save firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/backfill-invoice-summaries.mjs --project your-project-id --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/backfill-invoice-summaries.mjs --project your-project-id
 *
 * The script is idempotent. It writes each summary to
 * companies/{companyId}/invoiceSummaries/{invoiceId} with merge semantics.
 */

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const projectArgIndex = process.argv.indexOf('--project');
const projectId = projectArgIndex >= 0 ? process.argv[projectArgIndex + 1] : process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error('Missing project id. Pass --project <project-id> or set GCLOUD_PROJECT.');
  process.exit(1);
}

let initializeApp;
let applicationDefault;
let getFirestore;
let FieldValue;
try {
  ({ initializeApp, applicationDefault } = await import('firebase-admin/app'));
  ({ getFirestore, FieldValue } = await import('firebase-admin/firestore'));
} catch (error) {
  console.error('Missing firebase-admin. Install it with: npm install --no-save firebase-admin');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

let scanned = 0;
let migrated = 0;
let skipped = 0;
let batch = db.batch();
let pendingWrites = 0;

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));
}

function summaryFor(invoiceId, clientId, invoice) {
  return withoutUndefined({
    id: invoiceId,
    clientId,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    filename: invoice.filename,
    total: Number(invoice.total ?? 0) || 0,
    amountPaid: Number(invoice.amountPaid ?? 0) || 0,
    creditAmount: invoice.creditAmount,
    refundAmount: invoice.refundAmount,
    overpaidAmount: invoice.overpaidAmount,
    status: invoice.status ?? 'sent',
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: invoice.createdAt,
    createdBy: invoice.createdBy,
    backfilledAt: FieldValue.serverTimestamp(),
    backfilledFrom: `clients/${clientId}/invoices/${invoiceId}`,
  });
}

async function flush() {
  if (!pendingWrites) return;
  if (dryRun) {
    pendingWrites = 0;
    batch = db.batch();
    return;
  }
  await batch.commit();
  pendingWrites = 0;
  batch = db.batch();
}

const companiesSnap = await db.collection('companies').get();
for (const companyDoc of companiesSnap.docs) {
  const clientsSnap = await companyDoc.ref.collection('clients').get();

  for (const clientDoc of clientsSnap.docs) {
    const invoicesSnap = await clientDoc.ref.collection('invoices').get();

    for (const invoiceDoc of invoicesSnap.docs) {
      scanned += 1;
      const invoice = invoiceDoc.data();
      if (!invoiceDoc.id) {
        skipped += 1;
        continue;
      }

      const summaryRef = companyDoc.ref.collection('invoiceSummaries').doc(invoiceDoc.id);
      console.log(`${dryRun ? '[dry-run] Would backfill' : 'Backfilling'} ${invoiceDoc.ref.path} -> ${summaryRef.path}`);
      batch.set(summaryRef, summaryFor(invoiceDoc.id, clientDoc.id, invoice), { merge: true });
      pendingWrites += 1;
      migrated += 1;

      if (pendingWrites >= 400) await flush();
    }
  }
}

await flush();

console.log(`Done. scanned=${scanned} migrated=${migrated} skipped=${skipped} dryRun=${dryRun}`);
