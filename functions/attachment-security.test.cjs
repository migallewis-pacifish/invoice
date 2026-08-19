const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('./index');

function firestore(records) {
  return { doc(path) { return { async get() { return records[path] ? { exists: true, data: () => records[path] } : { exists: false }; } }; } };
}
const base = { companyId: 'co', clientId: 'client-a', documentType: 'invoice', documentId: 'inv-1' };
const invoicePath = 'companies/co/clients/client-a/invoices/inv-1';

test('email document must exist at its company/client/type path', async () => {
  await assert.rejects(_test.loadEmailDocument(base, firestore({})), error => error.code === 'not-found');
  await assert.rejects(_test.loadEmailDocument({ ...base, clientId: 'client-b' }, firestore({ [invoicePath]: {} })), error => error.code === 'not-found');
  await assert.rejects(_test.loadEmailDocument({ ...base, documentType: 'letter' }, firestore({ [invoicePath]: {} })), error => error.code === 'not-found');
});

test('stored document identity must agree with its location', async () => {
  await assert.rejects(_test.loadEmailDocument(base, firestore({ [invoicePath]: { clientId: 'client-b' } })), error => error.code === 'failed-precondition');
});

test('only canonical generated attachments recorded on the document are accepted', async () => {
  const canonical = 'companies/co/generated/client-a/invoices/inv-1/inv-1.pdf';
  const document = await _test.loadEmailDocument(base, firestore({ [invoicePath]: { generatedOutputs: [{ storagePath: canonical }] } }));
  const bucket = { file(path) { assert.equal(path, canonical); return { async getMetadata() { return [{ contentType: 'application/pdf', size: '3' }]; }, async download() { return [Buffer.from('PDF')]; } }; } };
  const attachment = await _test.resolveEmailAttachment({ ...base, attachment: { storagePath: canonical } }, document, bucket);
  assert.equal(attachment.content, Buffer.from('PDF').toString('base64'));
  for (const storagePath of ['companies/co/generated/../secret.pdf', 'companies/other/generated/file.pdf', 'companies/co/private/file.pdf']) {
    await assert.rejects(_test.resolveEmailAttachment({ ...base, attachment: { storagePath } }, document, bucket), error => error.code === 'invalid-argument');
  }
  await assert.rejects(_test.resolveEmailAttachment({ ...base, attachment: { storagePath: 'companies/co/generated/client-a/invoices/other.pdf' } }, document, bucket), error => error.code === 'permission-denied');
});
