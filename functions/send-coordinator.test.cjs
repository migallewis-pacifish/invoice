const test = require('node:test');
const assert = require('node:assert/strict');
const { createSendCoordinator } = require('./email/send-coordinator');

function fakeFirestore() {
  const values = new Map();
  let failRelatedOnce = false;
  let chain = Promise.resolve();
  const ref = path => ({
    path, id: path.split('/').pop(),
    async set(value, options) { values.set(path, options?.merge ? { ...values.get(path), ...value } : value); },
  });
  const db = {
    values, doc: ref,
    failNextRelatedTransaction() { failRelatedOnce = true; },
    runTransaction(fn) {
      const execution = chain.then(async () => {
        const writes = [];
        const transaction = {
          get: async target => ({ exists: values.has(target.path), data: () => values.get(target.path) }),
          set: (target, value, options) => writes.push(() => values.set(target.path, options?.merge ? { ...values.get(target.path), ...value } : value)),
          update: (target, value) => writes.push(() => values.set(target.path, { ...values.get(target.path), ...value })),
        };
        await fn(transaction);
        if (failRelatedOnce && writes.some(write => String(write).includes('values.set'))) {
          // The first transaction has two writes (the claim); recovery has four.
          if (writes.length > 2) { failRelatedOnce = false; throw new Error('firestore unavailable'); }
        }
        writes.forEach(write => write());
      });
      chain = execution.catch(() => {});
      return execution;
    },
  };
  return db;
}

const FieldValue = { serverTimestamp: () => 'SERVER_TIME', increment: value => ({ increment: value }) };
const base = {
  data: { companyId: 'co', clientId: 'client', documentType: 'invoice', documentId: 'inv',
    idempotencyKey: 'abcdefghijklmnop', recipient: 'a@example.com', cc: [], bcc: [], subject: 'Invoice' },
  document: { path: 'companies/co/clients/client/invoices/inv', record: { status: 'draft' } },
  uid: 'user', route: { provider: 'gmail', requestedProvider: 'gmail', fallbackReason: null },
};
const accepted = { accepted: true, effectiveProvider: 'gmail', requestedProvider: 'gmail', fallbackReason: null, messageId: 'provider-1', sentAt: '2026-01-01T00:00:00Z' };

test('repeated callable invocations return the stored provider result without resending', async () => {
  const db = fakeFirestore(); let sends = 0;
  const coordinate = createSendCoordinator({ db, FieldValue });
  const first = await coordinate({ ...base, dispatch: async () => { sends++; return accepted; } });
  const second = await coordinate({ ...base, dispatch: async () => { sends++; return accepted; } });
  assert.equal(sends, 1); assert.equal(second.messageId, first.messageId); assert.equal(second.status, 'accepted');
});

test('a client disconnect after provider acceptance is recovered from the server-owned record', async () => {
  const db = fakeFirestore(); let sends = 0;
  const coordinate = createSendCoordinator({ db, FieldValue });
  await coordinate({ ...base, dispatch: async () => { sends++; return accepted; } }); // caller can discard this response
  const recovered = await coordinate({ ...base, dispatch: async () => { sends++; return accepted; } });
  assert.equal(recovered.accepted, true); assert.equal(sends, 1);
});

test('Firestore metadata failure recovers without a second provider call', async () => {
  const db = fakeFirestore(); db.failNextRelatedTransaction(); let sends = 0;
  const coordinate = createSendCoordinator({ db, FieldValue });
  await assert.rejects(coordinate({ ...base, dispatch: async () => { sends++; return accepted; } }), /firestore unavailable/);
  const result = await coordinate({ ...base, dispatch: async () => { sends++; return accepted; } });
  assert.equal(result.messageId, 'provider-1'); assert.equal(sends, 1);
  assert.equal(db.values.get('companies/co/clients/client/invoices/inv').emailSendRecordId, result.sendRecordId);
});

test('concurrent sends with one idempotency key invoke the provider once', async () => {
  const db = fakeFirestore(); let sends = 0; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const coordinate = createSendCoordinator({ db, FieldValue });
  const first = coordinate({ ...base, dispatch: async () => { sends++; await gate; return accepted; } });
  await new Promise(resolve => setImmediate(resolve));
  const second = coordinate({ ...base, dispatch: async () => { sends++; return accepted; } });
  await assert.rejects(second, error => error.code === 'aborted');
  release(); await first; assert.equal(sends, 1);
});
