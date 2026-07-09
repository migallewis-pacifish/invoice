import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Firestore, doc, getDoc, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { from, Observable, switchMap } from 'rxjs';
import { ActivityService } from './activity.service';
import { CompanyEmailTemplateType, EmailTemplateVariables } from '../models/company-email-template.model';
import { EmailTemplateService, validateRenderedEmail } from './email-template.service';

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
  private readonly emailTemplateService = inject(EmailTemplateService);

  send(request: SendEmailRequest): Observable<SendEmailResponse> {
    const errors = [...validateSendEmailRequest(request), ...this.validateRenderedRequest(request)];
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

  async buildDefaultRequest(documentType: EmailDocumentType, document: any, companyId: string, clientId: string, recipient = '', client?: any): Promise<SendEmailRequest> {
    const request = this.defaultRequest(documentType, document, companyId, clientId, recipient);
    const templateType = this.templateTypeFor(documentType, document);
    const template = await this.emailTemplateService.getTemplate(companyId, templateType);
    const variables = await this.buildTemplateVariables(companyId, document, client);
    const rendered = this.emailTemplateService.render(template, variables);
    if (rendered.errors.length) throw new Error(rendered.errors.join(' '));
    return { ...request, subject: rendered.subject, messageBody: rendered.body };
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

  validateRenderedRequest(request: SendEmailRequest): string[] {
    return validateRenderedEmail(request.subject, request.messageBody);
  }

  private templateTypeFor(documentType: EmailDocumentType, document: any): CompanyEmailTemplateType {
    if (documentType === 'letter') return 'letter';
    if (document?.status === 'overdue') return 'overdueNotice';
    if (document?.status === 'sent' || document?.status === 'partial') return 'paymentReminder';
    return 'invoice';
  }

  private async buildTemplateVariables(companyId: string, document: any, client?: any): Promise<EmailTemplateVariables> {
    const companySnap = await getDoc(doc(this.db, `companies/${companyId}`));
    const company = companySnap.exists() ? companySnap.data() as any : {};
    const invoiceNumber = document?.invoiceNumber || document?.invoice_number || document?.filename || document?.title || document?.id || '';
    return {
      clientName: client?.name || client?.client_name || document?.client_name || 'client',
      invoiceNumber,
      dueDate: this.formatTemplateDate(document?.dueDate || document?.due_date),
      total: this.formatTemplateTotal(document?.total),
      companyName: company?.name || company?.companyName || 'our team',
      paymentReference: document?.reference || document?.paymentReference || invoiceNumber
    };
  }

  private formatTemplateDate(value: any): string {
    const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'the due date';
  }

  private formatTemplateTotal(value: any): string {
    if (value === undefined || value === null || value === '') return 'the invoice total';
    return typeof value === 'number' ? value.toFixed(2) : String(value);
  }
}
