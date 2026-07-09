#!/usr/bin/env node
/**
 * Copies legacy client-linked expenses from companies/{companyId}/expenses into
 * companies/{companyId}/clients/{clientId}/expenses.
 *
 * Usage:
 *   npm install --no-save firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-client-expenses.mjs --project your-project-id --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-client-expenses.mjs --project your-project-id --delete-legacy
 *
 * The script is idempotent because it writes each migrated expense using the
 * legacy expense document id in the destination client subcollection. By default
 * it keeps the legacy records for read compatibility; pass --delete-legacy only
 * after verifying the migration.
 */

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const deleteLegacy = args.has('--delete-legacy');
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

const companiesSnap = await db.collection('companies').get();
let scanned = 0;
let skipped = 0;
let migrated = 0;
let batch = db.batch();
let pendingWrites = 0;

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

for (const companyDoc of companiesSnap.docs) {
  const legacyExpensesSnap = await companyDoc.ref.collection('expenses').where('clientId', '>', '').get();

  for (const expenseDoc of legacyExpensesSnap.docs) {
    scanned += 1;
    const expense = expenseDoc.data();
    const clientId = expense.clientId;

    if (typeof clientId !== 'string' || !clientId.trim()) {
      skipped += 1;
      continue;
    }

    const destinationRef = companyDoc.ref.collection('clients').doc(clientId).collection('expenses').doc(expenseDoc.id);
    const destinationSnap = await destinationRef.get();
    if (destinationSnap.exists) {
      skipped += 1;
      console.log(`Skipping ${companyDoc.id}/${expenseDoc.id}: destination already exists for client ${clientId}.`);
      continue;
    }

    const migratedExpense = {
      ...expense,
      clientId,
      migratedFrom: expenseDoc.ref.path,
      migratedAt: FieldValue.serverTimestamp()
    };

    console.log(`${dryRun ? '[dry-run] Would migrate' : 'Migrating'} ${expenseDoc.ref.path} -> ${destinationRef.path}`);
    batch.set(destinationRef, migratedExpense, { merge: true });
    pendingWrites += 1;

    if (deleteLegacy) {
      batch.delete(expenseDoc.ref);
      pendingWrites += 1;
    }

    migrated += 1;
    if (pendingWrites >= 400) await flush();
  }
}

await flush();

console.log(`Done. scanned=${scanned} migrated=${migrated} skipped=${skipped} dryRun=${dryRun} deleteLegacy=${deleteLegacy}`);
