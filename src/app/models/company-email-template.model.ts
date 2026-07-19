export type CompanyEmailTemplateType = 'invoice' | 'paymentReminder' | 'beforeDueReminder' | 'dueTodayReminder' | 'overdueReminder' | 'overdueNotice' | 'letter';

export interface CompanyEmailTemplate {
  id: CompanyEmailTemplateType;
  companyId: string;
  type: CompanyEmailTemplateType;
  name: string;
  description: string;
  subject: string;
  body: string;
  updatedAt?: any;
  createdAt?: any;
}

export interface EmailTemplateVariables {
  clientName: string;
  invoiceNumber: string;
  dueDate: string;
  total: string;
  companyName: string;
  paymentReference: string;
  outstandingBalance: string;
  daysOverdue: string;
}

export const EMAIL_TEMPLATE_VARIABLES: (keyof EmailTemplateVariables)[] = [
  'clientName',
  'invoiceNumber',
  'dueDate',
  'total',
  'companyName',
  'paymentReference',
  'outstandingBalance',
  'daysOverdue'
];

export const EMAIL_TEMPLATE_VARIABLE_LABELS: Record<keyof EmailTemplateVariables, string> = {
  clientName: 'Client name',
  invoiceNumber: 'Invoice number',
  dueDate: 'Due date',
  total: 'Total',
  companyName: 'Company name',
  paymentReference: 'Payment reference',
  outstandingBalance: 'Outstanding balance',
  daysOverdue: 'Days overdue'
};

export const DEFAULT_COMPANY_EMAIL_TEMPLATES: Omit<CompanyEmailTemplate, 'companyId' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'invoice',
    type: 'invoice',
    name: 'Invoice sending',
    description: 'Used when sending an invoice to a client.',
    subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
    body: 'Hi {{clientName}},\n\nPlease find invoice {{invoiceNumber}} attached. The total is {{total}} and payment is due by {{dueDate}}.\n\nPlease use payment reference {{paymentReference}} when making payment.\n\nRegards,\n{{companyName}}'
  },
  {
    id: 'paymentReminder',
    type: 'paymentReminder',
    name: 'Payment reminder',
    description: 'Used to remind a client about an upcoming invoice payment.',
    subject: 'Payment reminder for invoice {{invoiceNumber}}',
    body: 'Hi {{clientName}},\n\nThis is a friendly reminder that invoice {{invoiceNumber}} for {{total}} is due on {{dueDate}}.\n\nPayment reference: {{paymentReference}}\n\nThank you,\n{{companyName}}'
  },

  {
    id: 'beforeDueReminder',
    type: 'beforeDueReminder',
    name: 'Before-due invoice reminder',
    description: 'Used to remind a client before an invoice due date.',
    subject: 'Upcoming payment reminder for invoice {{invoiceNumber}}',
    body: 'Hi {{clientName}},\n\nThis is a friendly reminder that invoice {{invoiceNumber}} has an outstanding balance of {{outstandingBalance}} due on {{dueDate}}.\n\nPlease use payment reference {{paymentReference}} when making payment.\n\nThank you,\n{{companyName}}'
  },
  {
    id: 'dueTodayReminder',
    type: 'dueTodayReminder',
    name: 'Due-today invoice reminder',
    description: 'Used when an invoice payment is due today.',
    subject: 'Invoice {{invoiceNumber}} is due today',
    body: 'Hi {{clientName}},\n\nInvoice {{invoiceNumber}} has an outstanding balance of {{outstandingBalance}} due today.\n\nPayment reference: {{paymentReference}}\n\nThank you,\n{{companyName}}'
  },
  {
    id: 'overdueReminder',
    type: 'overdueReminder',
    name: 'Overdue invoice reminder',
    description: 'Used to follow up on overdue invoice payments.',
    subject: 'Reminder: overdue invoice {{invoiceNumber}}',
    body: 'Hi {{clientName}},\n\nInvoice {{invoiceNumber}} has an outstanding balance of {{outstandingBalance}} and is {{daysOverdue}} day(s) overdue. It was due on {{dueDate}}.\n\nPlease arrange payment using reference {{paymentReference}}.\n\nRegards,\n{{companyName}}'
  },
  {
    id: 'overdueNotice',
    type: 'overdueNotice',
    name: 'Overdue notice',
    description: 'Used when an invoice payment is overdue.',
    subject: 'Overdue invoice {{invoiceNumber}}',
    body: 'Hi {{clientName}},\n\nOur records show invoice {{invoiceNumber}} for {{total}} was due on {{dueDate}} and is now overdue.\n\nPlease arrange payment using reference {{paymentReference}}.\n\nRegards,\n{{companyName}}'
  },
  {
    id: 'letter',
    type: 'letter',
    name: 'Letter sending',
    description: 'Used when sending a letter document to a client.',
    subject: 'Letter from {{companyName}}',
    body: 'Hi {{clientName}},\n\nPlease find the attached letter from {{companyName}}.\n\nRegards,\n{{companyName}}'
  }
];
