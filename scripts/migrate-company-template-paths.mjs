#!/usr/bin/env node
/**
 * Migrates legacy company.templatePath values into the templates subcollection.
 *
 * Usage:
 *   npm install --no-save firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-company-template-paths.mjs --project your-project-id --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-company-template-paths.mjs --project your-project-id --remove-legacy
 *
 * By default the script writes companies/{companyId}/templates/invoice and keeps
 * the legacy company.templatePath field. Pass --remove-legacy after verifying the
 * migration if you want to delete the legacy field from company documents.
 */

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const removeLegacy = args.has('--remove-legacy');
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
  scanned += 1;
  const company = companyDoc.data();
  const templatePath = company.templatePath;
  if (typeof templatePath !== 'string' || !templatePath.trim()) {
    skipped += 1;
    continue;
  }

  const templateRef = companyDoc.ref.collection('templates').doc('invoice');
  const templateSnap = await templateRef.get();
  if (templateSnap.exists && templateSnap.data()?.storagePath) {
    skipped += 1;
    console.log(`Skipping ${companyDoc.id}: invoice template document already exists.`);
    continue;
  }

  const now = Date.now();
  const template = {
    id: 'invoice',
    companyId: companyDoc.id,
    type: 'invoice',
    name: 'Default invoice template',
    storagePath: templatePath,
    fileName: templatePath.split('/').pop() || 'invoice.docx',
    isDefault: true,
    archived: false,
    createdAt: now,
    updatedAt: now
  };

  console.log(`${dryRun ? '[dry-run] Would migrate' : 'Migrating'} ${companyDoc.id}: ${templatePath}`);
  batch.set(templateRef, template, { merge: true });
  pendingWrites += 1;

  if (removeLegacy) {
    batch.update(companyDoc.ref, { templatePath: FieldValue.delete() });
    pendingWrites += 1;
  }

  migrated += 1;
  if (pendingWrites >= 400) await flush();
}

await flush();

console.log(`Done. scanned=${scanned} migrated=${migrated} skipped=${skipped} dryRun=${dryRun} removeLegacy=${removeLegacy}`);
