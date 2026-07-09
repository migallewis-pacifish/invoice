import { renderTemplateText, validateEmailTemplate, validateRenderedEmail } from './email-template.service';
import { EmailTemplateVariables } from '../models/company-email-template.model';

describe('email template utilities', () => {
  const variables: EmailTemplateVariables = {
    clientName: 'Acme Ltd',
    invoiceNumber: 'INV-100',
    dueDate: '2026-07-31',
    total: 'R 500.00',
    companyName: 'Nexus Co',
    paymentReference: 'INV-100'
  };

  it('renders supported template variables', () => {
    expect(renderTemplateText('Hi {{ clientName }}, invoice {{invoiceNumber}} is {{total}}.', variables))
      .toBe('Hi Acme Ltd, invoice INV-100 is R 500.00.');
  });

  it('rejects unknown template variables', () => {
    expect(validateEmailTemplate('Hello {{unknown}}', 'Body')).toContain('Unknown template variable: unknown.');
  });

  it('validates rendered content before sending', () => {
    expect(validateRenderedEmail('Invoice {{invoiceNumber}}', 'Body')).toContain('Rendered email still contains unresolved template variables.');
    expect(validateRenderedEmail('Invoice INV-100', 'Body')).toEqual([]);
  });
});
