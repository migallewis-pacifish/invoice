import { validateSendEmailRequest, normalizeEmailList, SendEmailRequest } from './email.service';

describe('EmailService request validation', () => {
  const base: SendEmailRequest = {
    companyId: 'company-1',
    clientId: 'client-1',
    documentType: 'invoice',
    documentId: 'invoice-1',
    recipient: 'client@example.com',
    cc: [],
    bcc: [],
    subject: 'Invoice INV-001',
    messageBody: 'Please see attached.',
    attachment: { storagePath: 'companies/company-1/invoices/INV-001.pdf' }
  };

  it('accepts valid invoice email requests', () => {
    expect(validateSendEmailRequest(base)).toEqual([]);
  });

  it('requires a valid recipient, subject, body, and attachment reference', () => {
    const errors = validateSendEmailRequest({
      ...base,
      recipient: 'not-an-email',
      subject: '',
      messageBody: '',
      attachment: {}
    });

    expect(errors).toContain('A valid recipient email is required.');
    expect(errors).toContain('Subject is required.');
    expect(errors).toContain('Message body is required.');
    expect(errors).toContain('An attachment storage path or generated document payload reference is required.');
  });

  it('normalizes comma and semicolon separated cc/bcc email lists', () => {
    expect(normalizeEmailList('a@example.com, b@example.com; c@example.com')).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com'
    ]);
  });

  it('allows generated document payload references instead of storage paths', () => {
    expect(validateSendEmailRequest({
      ...base,
      documentType: 'letter',
      attachment: { generatedDocumentPayloadRef: 'generatedPayloads/payload-1' }
    })).toEqual([]);
  });
});
