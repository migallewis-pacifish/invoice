const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  enqueueOverdueReminders, claimReminderJob, reminderFailureUpdate,
  buildReminderMessage, completeReminderJob, REMINDER_MAX_ATTEMPTS,
} = require('./index')._test;

class Snap {
  constructor(ref, value) { this.ref = ref; this.id = ref.id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
  get(field) { return field.split('.').reduce((v, k) => v?.[k], this.value); }
}
class Ref {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  get() { return Promise.resolve(new Snap(this, this.db.data.get(this.path))); }
  set(value, options) { this.db.write(this.path, value, options); return Promise.resolve(); }
}
class Query {
  constructor(db, path, filters = []) { this.db = db; this.path = path; this.filters = filters; }
  where(field, op, value) { return new Query(this.db, this.path, [...this.filters, [field, op, value]]); }
  async get() {
    const depth = this.path.split('/').length + 1;
    const docs = [...this.db.data].filter(([p]) => p.startsWith(`${this.path}/`) && p.split('/').length === depth)
      .filter(([, value]) => this.filters.every(([field, op, expected]) => op === 'in' && expected.includes(value[field])))
      .map(([p, value]) => new Snap(new Ref(this.db, p), value));
    return { docs, empty: !docs.length };
  }
}
class FakeDb {
  constructor(values) { this.data = new Map(Object.entries(values)); this.lock = Promise.resolve(); }
  doc(path) { return new Ref(this, path); }
  collection(path) { return new Query(this, path); }
  write(path, value, options) {
    const old = this.data.get(path) || {};
    const expanded = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.includes('.')) { const [head, tail] = key.split('.'); expanded[head] = { ...(old[head] || {}), ...(expanded[head] || {}), [tail]: val }; }
      else expanded[key] = val && val.__increment ? Number(old[key] || 0) + val.__increment : val;
    }
    this.data.set(path, options?.merge ? { ...old, ...expanded } : expanded);
  }
  runTransaction(callback) {
    const run = this.lock.then(() => callback({
      get: ref => ref.get(),
      set: (ref, value, options) => this.write(ref.path, value, options),
    }));
    this.lock = run.catch(() => {}); return run;
  }
}
const FieldValue = { serverTimestamp: () => 'SERVER_TIME', increment: n => ({ __increment: n }) };
const base = {
  'companies/co': { name: 'Co', reminderPolicy: { enabled: true, overdue: { cadenceDays: 7 } } },
  'companies/co/invoiceSummaries/inv': { status: 'overdue', clientId: 'client', dueDate: '2026-08-01', total: 100, amountPaid: 0 },
  'companies/co/clients/client': { name: 'Client', email: 'billing@example.com' },
};

test('duplicate scheduler runs create one deterministic reminder job', async () => {
  const db = new FakeDb(base); const now = new Date('2026-08-19T08:00:00Z');
  assert.equal(await enqueueOverdueReminders({ db, now, FieldValue }), 1);
  assert.equal(await enqueueOverdueReminders({ db, now, FieldValue }), 0);
  const jobs = [...db.data].filter(([p]) => p.includes('/emailReminderQueue/'));
  assert.equal(jobs.length, 1); assert.equal(jobs[0][1].dedupKey, 'co:inv:overdue:2026-08-19');
});

test('concurrent workers transactionally allow only one claim', async () => {
  const path = 'companies/co/emailReminderQueue/job';
  const db = new FakeDb({ [path]: { status: 'queued', attempts: 0, nextAttemptAt: new Date(0) } });
  const [one, two] = await Promise.all([claimReminderJob(db, db.doc(path)), claimReminderJob(db, db.doc(path))]);
  assert.equal([one, two].filter(Boolean).length, 1); assert.equal(db.data.get(path).attempts, 1);
});

test('retry behavior is bounded and records observable errors', () => {
  const retry = reminderFailureUpdate(new HttpsError('unavailable', 'provider temporarily unavailable'), 1, new Date('2026-08-19T00:00:00Z'));
  assert.equal(retry.status, 'retry'); assert.equal(retry.error.code, 'unavailable'); assert.ok(retry.nextAttemptAt > retry.failedAt);
  const terminal = reminderFailureUpdate(new HttpsError('unavailable', 'still unavailable'), REMINDER_MAX_ATTEMPTS);
  assert.equal(terminal.status, 'terminal_failure'); assert.equal(terminal.retryable, false);
});

test('disabled reminders and paid invoices are not enqueued', async () => {
  const disabled = structuredClone(base); disabled['companies/co'].reminderPolicy.enabled = false;
  assert.equal(await enqueueOverdueReminders({ db: new FakeDb(disabled), now: new Date('2026-08-19'), FieldValue }), 0);
  const paid = structuredClone(base); paid['companies/co/invoiceSummaries/inv'].status = 'paid'; paid['companies/co/invoiceSummaries/inv'].amountPaid = 100;
  assert.equal(await enqueueOverdueReminders({ db: new FakeDb(paid), now: new Date('2026-08-19'), FieldValue }), 0);
});

test('worker rejects server invoices without an attachment', async () => {
  const db = new FakeDb({ ...base, 'companies/co/clients/client/invoices/inv': { status: 'sent' } });
  await assert.rejects(buildReminderMessage({ companyId: 'co', clientId: 'client', invoiceId: 'inv', recipientHash: require('node:crypto').createHash('sha256').update('billing@example.com').digest('hex') }, db), /attachment is missing/);
});

test('successful completion updates queue, invoice, and summary metadata atomically', async () => {
  const path = 'companies/co/emailReminderQueue/job';
  const invoicePath = 'companies/co/clients/client/invoices/inv';
  const db = new FakeDb({ [path]: { status: 'processing' }, [invoicePath]: {}, 'companies/co/invoiceSummaries/inv': { reminderCount: 2 } });
  await completeReminderJob({ db, ref: db.doc(path), job: { reminderType: 'overdue' }, document: { path: invoicePath }, data: { companyId: 'co', documentId: 'inv' }, result: { effectiveProvider: 'gmail', messageId: 'message-1' }, FieldValue });
  assert.equal(db.data.get(path).status, 'completed'); assert.equal(db.data.get(path).providerMessageId, 'message-1');
  assert.equal(db.data.get(invoicePath).lastReminderType, 'overdue');
  assert.equal(db.data.get('companies/co/invoiceSummaries/inv').reminderCount, 3);
  assert.equal(db.data.get('companies/co/invoiceSummaries/inv').lastEmail.providerMessageId, 'message-1');
});
