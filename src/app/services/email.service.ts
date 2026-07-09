import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Firestore, doc, getDoc, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { from, Observable, switchMap } from 'rxjs';
import { ActivityService } from './activity.service';

export type EmailDocumentType = 'invoice' | 'letter';

export interface EmailAttachmentReference {
  storagePath?: string;
  generatedDocumentPayloadRef?: string;
  fileName?: string;
  contentType?: string;
}

export interface SendEmailRequest {
  companyId: string;
  clientId: string;
  documentType: EmailDocumentType;
  documentId: string;
  recipient: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  messageBody: string;
  attachment?: EmailAttachmentReference;
}

export interface SendEmailResponse {
  provider: string;
  messageId: string;
  accepted: boolean;
  sentAt?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailList(value: string | string[] | undefined | null): string[] {
  const values = Array.isArray(value) ? value : (value || '').split(/[;,]/);
  return values.map(email => email.trim()).filter(Boolean);
}

export function validateSendEmailRequest(request: SendEmailRequest): string[] {
  const errors: string[] = [];
  if (!request.companyId) errors.push('Company ID is required.');
  if (!request.clientId) errors.push('Client ID is required.');
  if (request.documentType !== 'invoice' && request.documentType !== 'letter') errors.push('Document type must be invoice or letter.');
  if (!request.documentId) errors.push('Document record ID is required.');
  if (!EMAIL_PATTERN.test(request.recipient || '')) errors.push('A valid recipient email is required.');
  for (const email of [...normalizeEmailList(request.cc), ...normalizeEmailList(request.bcc)]) {
    if (!EMAIL_PATTERN.test(email)) errors.push(`Invalid copy recipient: ${email}.`);
  }
  if (!request.subject?.trim()) errors.push('Subject is required.');
  if (!request.messageBody?.trim()) errors.push('Message body is required.');
  if (!request.attachment?.storagePath && !request.attachment?.generatedDocumentPayloadRef) {
    errors.push('An attachment storage path or generated document payload reference is required.');
  }
  return errors;
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  private readonly functions = inject(Functions);
  private readonly db = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly activityService = inject(ActivityService);

  send(request: SendEmailRequest): Observable<SendEmailResponse> {
    const errors = validateSendEmailRequest(request);
    if (errors.length) throw new Error(errors.join(' '));

    const callable = httpsCallable<SendEmailRequest, SendEmailResponse>(this.functions, 'sendDocumentEmail');
    return from(callable({ ...request, cc: normalizeEmailList(request.cc), bcc: normalizeEmailList(request.bcc) })).pipe(
      switchMap(result => from(this.recordSuccessfulSend(request, result.data)))
    );
  }

  private async recordSuccessfulSend(request: SendEmailRequest, response: SendEmailResponse): Promise<SendEmailResponse> {
    const sentAt = serverTimestamp();
    const sentBy = this.auth.currentUser?.uid || 'unknown';
    const path = `companies/${request.companyId}/clients/${request.clientId}/${request.documentType === 'invoice' ? 'invoices' : 'letters'}/${request.documentId}`;
    const ref = doc(this.db, path);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() as any : {};
    const metadata = {
      sentAt,
      sentBy,
      recipient: request.recipient,
      cc: normalizeEmailList(request.cc),
      bcc: normalizeEmailList(request.bcc),
      subject: request.subject,
      emailProvider: response.provider,
      emailProviderMessageId: response.messageId,
    };
    const update: any = { ...metadata, lastEmail: metadata, updatedAt: sentAt };
    if (request.documentType === 'invoice' && current.status === 'draft') update.status = 'sent';
    await updateDoc(ref, update);

    if (request.documentType === 'invoice') {
      const summaryRef = doc(this.db, `companies/${request.companyId}/invoiceSummaries/${request.documentId}`);
      await setDoc(summaryRef, update, { merge: true });
    }

    await this.activityService.record(
      request.companyId,
      'update',
      path,
      `Sent ${request.documentType} ${request.documentId} email to ${request.recipient}.`
    );
    return response;
  }

  defaultRequest(documentType: EmailDocumentType, document: any, companyId: string, clientId: string, recipient = ''): SendEmailRequest {
    const label = documentType === 'invoice' ? (document.invoiceNumber || document.filename || 'invoice') : (document.title || document.filename || 'letter');
    return {
      companyId,
      clientId,
      documentType,
      documentId: document.id,
      recipient,
      subject: `${documentType === 'invoice' ? 'Invoice' : 'Letter'} ${label}`,
      messageBody: `Please find the attached ${documentType}.`,
      attachment: {
        storagePath: document.storagePath || document.documentStoragePath || document.filePath,
        generatedDocumentPayloadRef: document.generatedDocumentPayloadRef,
        fileName: document.filename || `${label}.pdf`,
      }
    };
  }
}
