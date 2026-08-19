const { createHash } = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const TERMINAL_SUCCESS = new Set(['accepted', 'delivered']);

function recordIdFor(data) {
  return createHash('sha256')
    .update([data.companyId, data.documentType, data.documentId, data.idempotencyKey].join('\0'))
    .digest('hex');
}

function requestFingerprint(data) {
  return createHash('sha256').update(JSON.stringify({
    clientId: data.clientId, recipient: String(data.recipient).trim().toLowerCase(),
    cc: data.cc || [], bcc: data.bcc || [], subject: data.subject,
    attachment: data.attachment?.storagePath, reminderType: data.reminderType || null,
  })).digest('hex');
}

function sanitizedError(error) {
  const code = String(error?.code || 'internal').replace(/^functions\//, '').slice(0, 80);
  // Provider response bodies can contain credentials or recipient data. Store a
  // stable classification and a bounded, single-line message only.
  const message = String(error?.message || 'Email provider error')
    .replace(/[\r\n]+/g, ' ').replace(/[A-Za-z0-9+/=_-]{32,}/g, '[redacted]').slice(0, 240);
  return { code, message };
}

function responseFrom(record, id) {
  return {
    provider: record.effectiveProvider, effectiveProvider: record.effectiveProvider,
    requestedProvider: record.requestedProvider, fallbackReason: record.fallbackReason || null,
    effectiveFrom: record.effectiveFrom || undefined, sendRecordId: id,
    messageId: record.providerMessageId, accepted: TERMINAL_SUCCESS.has(record.status),
    status: record.status, sentAt: record.acceptedAt || record.deliveredAt || null,
  };
}

function createSendCoordinator({ db, FieldValue }) {
  const now = () => FieldValue.serverTimestamp();

  async function persistRelated({ recordRef, record, data, document, uid }) {
    const documentRef = db.doc(document.path);
    const summaryRef = data.documentType === 'invoice'
      ? db.doc(`companies/${data.companyId}/invoiceSummaries/${data.documentId}`) : null;
    const activityRef = db.doc(`companies/${data.companyId}/activities/email-${recordRef.id}`);
    await db.runTransaction(async transaction => {
      const latest = (await transaction.get(recordRef)).data() || record;
      if (latest.metadataPersistedAt) return;
      const sentAt = now();
      const metadata = {
        sentAt, sentBy: uid, recipient: data.recipient, cc: data.cc || [], bcc: data.bcc || [],
        subject: data.subject, emailProvider: latest.effectiveProvider,
        effectiveEmailProvider: latest.effectiveProvider, emailFallbackReason: latest.fallbackReason || null,
        emailSendRecordId: recordRef.id, emailProviderMessageId: latest.providerMessageId,
        status: latest.status, failureReason: latest.failureReason || null,
      };
      const update = { ...metadata, lastEmail: metadata, updatedAt: sentAt };
      if (data.documentType === 'invoice' && document.record.status === 'draft') update.status = 'sent';
      if (data.documentType === 'invoice' && data.reminderType) {
        update.lastReminderSentAt = sentAt;
        update.reminderCount = FieldValue.increment(1);
        update.lastReminderType = data.reminderType;
      }
      transaction.update(documentRef, update);
      if (summaryRef) transaction.set(summaryRef, update, { merge: true });
      transaction.set(activityRef, {
        actorId: uid, actorName: 'Email sender', actorEmail: null,
        changeType: 'update', entityPath: document.path, createdAt: sentAt,
        description: data.reminderType
          ? `Sent ${data.reminderType} reminder for invoice ${data.documentId} to ${data.recipient}.`
          : `Sent ${data.documentType} ${data.documentId} email to ${data.recipient}.`,
      }, { merge: false });
      transaction.set(recordRef, { metadataPersistedAt: sentAt, updatedAt: sentAt }, { merge: true });
    });
  }

  return async function coordinate({ data, document, uid, route, effectiveFrom, dispatch }) {
    const id = recordIdFor(data);
    const recordRef = db.doc(`companies/${data.companyId}/emailSendRecords/${id}`);
    const fingerprint = requestFingerprint(data);
    let existing;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(recordRef);
      if (snapshot.exists) {
        existing = snapshot.data();
        if (existing.requestFingerprint !== fingerprint) {
          throw new HttpsError('already-exists', 'This idempotency key was already used for a different email request.');
        }
        if (TERMINAL_SUCCESS.has(existing.status)) return;
        if (existing.status === 'sending' || (existing.status === 'failed' && !existing.retrySafe)) {
          throw new HttpsError('aborted', 'The email attempt may already have reached the provider; check its send record instead of retrying with a new key.');
        }
        return;
      }
      transaction.set(recordRef, {
        companyId: data.companyId, clientId: data.clientId, documentType: data.documentType,
        documentId: data.documentId, documentPath: document.path, idempotencyKey: data.idempotencyKey,
        requestFingerprint: fingerprint, recipientHash: data.recipientHash,
        requestedProvider: route.requestedProvider, effectiveProvider: route.provider,
        provider: route.provider, fallbackReason: route.fallbackReason || null, effectiveFrom: effectiveFrom || null,
        sentBy: uid, status: 'pending', retrySafe: true, createdAt: now(), updatedAt: now(),
      });
    });

    if (existing && TERMINAL_SUCCESS.has(existing.status)) {
      if (!existing.metadataPersistedAt) await persistRelated({ recordRef, record: existing, data, document, uid });
      return responseFrom(existing, id);
    }

    await db.runTransaction(async transaction => {
      const current = (await transaction.get(recordRef)).data();
      if (current.status !== 'pending' && !(current.status === 'failed' && current.retrySafe)) {
        throw new HttpsError('aborted', 'Another invocation is already sending this email.');
      }
      transaction.set(recordRef, { status: 'sending', retrySafe: false, providerStartedAt: now(), updatedAt: now() }, { merge: true });
    });

    let result;
    try {
      result = await dispatch();
    } catch (error) {
      await recordRef.set({ status: 'failed', retrySafe: false, error: sanitizedError(error), failedAt: now(), updatedAt: now() }, { merge: true });
      throw error;
    }
    const accepted = {
      status: result.accepted === false ? 'failed' : 'accepted', retrySafe: false,
      provider: result.effectiveProvider, effectiveProvider: result.effectiveProvider,
      requestedProvider: result.requestedProvider, fallbackReason: result.fallbackReason || null,
      providerMessageId: result.messageId, acceptedAt: result.sentAt || new Date().toISOString(), updatedAt: now(),
    };
    await recordRef.set(accepted, { merge: true });
    await persistRelated({ recordRef, record: accepted, data, document, uid });
    return responseFrom(accepted, id);
  };
}

module.exports = { createSendCoordinator, recordIdFor, requestFingerprint, sanitizedError };
