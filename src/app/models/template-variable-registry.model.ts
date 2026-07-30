import { CompanyTemplateFormat } from './invoice.model';

export type LegacyEmailTemplateVariable = 'clientName' | 'invoiceNumber' | 'dueDate' | 'total' | 'companyName' | 'paymentReference' | 'outstandingBalance' | 'daysOverdue';

export type TemplateVariableGroup = 'Invoice' | 'Letter' | 'Client' | 'Company' | 'Payment' | 'Custom';
export type TemplateTypeWithVariables = 'invoice' | 'letter' | 'email';

export interface TemplateVariableDefinition {
  group: TemplateVariableGroup;
  path: string;
  label: string;
  docxKey?: string;
  legacyEmailKey?: LegacyEmailTemplateVariable;
  deprecatedAliases?: string[];
}

export interface TemplateVariableValidationResult {
  variables: string[];
  unknown: string[];
  missing: string[];
  deprecated: { variable: string; replacement: string; label: string }[];
}

export const TEMPLATE_VARIABLES: TemplateVariableDefinition[] = [
  { group: 'Company', path: 'company.name', label: 'Company name', docxKey: 'company_name', legacyEmailKey: 'companyName' },
  { group: 'Company', path: 'company.email', label: 'Company email', docxKey: 'company_email' },
  { group: 'Company', path: 'company.phone', label: 'Company phone', docxKey: 'company_tel' },
  { group: 'Company', path: 'company.address', label: 'Company address' },
  { group: 'Company', path: 'company.registrationNumber', label: 'Company registration number', docxKey: 'company_reg_no' },
  { group: 'Company', path: 'company.street', label: 'Company street', docxKey: 'company_street' },
  { group: 'Company', path: 'company.suburb', label: 'Company suburb', docxKey: 'company_suburb' },
  { group: 'Company', path: 'company.city', label: 'Company city', docxKey: 'company_city' },
  { group: 'Company', path: 'company.province', label: 'Company province', docxKey: 'company_province' },
  { group: 'Company', path: 'company.postalCode', label: 'Company postal code', docxKey: 'company_postal_code' },
  { group: 'Client', path: 'client.name', label: 'Client name', docxKey: 'client_name', legacyEmailKey: 'clientName' },
  { group: 'Client', path: 'client.email', label: 'Client email', docxKey: 'client_email' },
  { group: 'Client', path: 'client.phone', label: 'Client phone', docxKey: 'client_contact_no' },
  { group: 'Client', path: 'client.street', label: 'Client street', docxKey: 'client_street' },
  { group: 'Client', path: 'client.suburb', label: 'Client suburb', docxKey: 'client_suburb' },
  { group: 'Client', path: 'client.city', label: 'Client city', docxKey: 'client_city' },
  { group: 'Client', path: 'client.province', label: 'Client province', docxKey: 'client_province' },
  { group: 'Client', path: 'client.postalCode', label: 'Client postal code', docxKey: 'client_postal_code' },
  { group: 'Invoice', path: 'invoice.number', label: 'Invoice number', docxKey: 'invoice_number', legacyEmailKey: 'invoiceNumber' },
  { group: 'Invoice', path: 'invoice.date', label: 'Invoice date', docxKey: 'invoice_date' },
  { group: 'Invoice', path: 'invoice.dueDate', label: 'Invoice due date', legacyEmailKey: 'dueDate' },
  { group: 'Invoice', path: 'invoice.items', label: 'Invoice line items', docxKey: 'items' },
  { group: 'Invoice', path: 'invoice.subtotal', label: 'Invoice subtotal', docxKey: 'excluding_vat' },
  { group: 'Invoice', path: 'invoice.vat', label: 'Invoice VAT', docxKey: 'vat_amount' },
  { group: 'Invoice', path: 'invoice.vatPercentage', label: 'Invoice VAT percentage', docxKey: 'vat_percentage' },
  { group: 'Invoice', path: 'invoice.total', label: 'Invoice total', docxKey: 'total', legacyEmailKey: 'total' },
  { group: 'Invoice', path: 'invoice.notes', label: 'Invoice notes', docxKey: 'notes' },
  { group: 'Payment', path: 'payment.reference', label: 'Payment reference', docxKey: 'reference', legacyEmailKey: 'paymentReference' },
  { group: 'Payment', path: 'payment.outstandingBalance', label: 'Outstanding balance', legacyEmailKey: 'outstandingBalance' },
  { group: 'Payment', path: 'payment.daysOverdue', label: 'Days overdue', legacyEmailKey: 'daysOverdue' },
  { group: 'Letter', path: 'letter.title', label: 'Letter title', docxKey: 'letter_title' },
  { group: 'Letter', path: 'letter.message', label: 'Letter message', docxKey: 'letter_message' },
  { group: 'Letter', path: 'letter.date', label: 'Letter date', docxKey: 'letter_date' },
  { group: 'Letter', path: 'letter.signedBy', label: 'Signed by', docxKey: 'signed_by' },
  { group: 'Letter', path: 'letter.signatureUrl', label: 'Signature URL', docxKey: 'signature_url' },
  { group: 'Custom', path: 'custom.notes', label: 'Custom notes' }
];

export const LEGACY_EMAIL_VARIABLE_MAP: Record<LegacyEmailTemplateVariable, string> = TEMPLATE_VARIABLES.reduce((map, variable) => {
  if (variable.legacyEmailKey) map[variable.legacyEmailKey] = variable.path;
  return map;
}, {} as Record<LegacyEmailTemplateVariable, string>);

export const EMAIL_TEMPLATE_VARIABLES = Object.keys(LEGACY_EMAIL_VARIABLE_MAP) as LegacyEmailTemplateVariable[];
export const EMAIL_TEMPLATE_VARIABLE_LABELS = EMAIL_TEMPLATE_VARIABLES.reduce((labels, key) => {
  labels[key] = variableLabel(key);
  return labels;
}, {} as Record<LegacyEmailTemplateVariable, string>);

export function variableLabel(key: string): string {
  return TEMPLATE_VARIABLES.find(variable => matchesVariable(variable, key))?.label ?? key;
}

export function variableToken(path: string): string { return `{{${path}}}`; }

export function groupedTemplateVariables(groups: TemplateVariableGroup[] = ['Company', 'Client', 'Invoice', 'Letter', 'Payment', 'Custom']) {
  return groups.map(group => ({ group, variables: TEMPLATE_VARIABLES.filter(variable => variable.group === group) }));
}

export function canonicalVariablePath(key: string): string | null {
  const variable = TEMPLATE_VARIABLES.find(candidate => matchesVariable(candidate, key));
  return variable?.path ?? null;
}

export function variableKeysForFormat(format: CompanyTemplateFormat | 'email'): string[] {
  if (format === 'docx') return TEMPLATE_VARIABLES.flatMap(variable => variable.docxKey ? [variable.docxKey] : []);
  return TEMPLATE_VARIABLES.map(variable => variable.path);
}

export function requiredVariablesForTemplate(type: 'invoice' | 'letter', format: CompanyTemplateFormat | 'email' = 'docx'): string[] {
  const paths = type === 'invoice' ? ['invoice.number', 'invoice.total'] : ['letter.title', 'letter.message', 'letter.date'];
  return paths.map(path => format === 'docx' ? TEMPLATE_VARIABLES.find(variable => variable.path === path)?.docxKey ?? path : path);
}

export function validateTemplateVariables(keys: string[], type: 'invoice' | 'letter', format: CompanyTemplateFormat | 'email'): TemplateVariableValidationResult {
  const known = new Set(variableKeysForFormat(format));
  const canonicalKnown = new Set(TEMPLATE_VARIABLES.map(variable => variable.path));
  const variables = Array.from(new Set(keys));
  const unknown = variables.filter(key => !known.has(key) && !canonicalKnown.has(key) && !canonicalVariablePath(key));
  const deprecated = variables.flatMap(key => {
    const replacement = format === 'email' ? LEGACY_EMAIL_VARIABLE_MAP[key as LegacyEmailTemplateVariable] : null;
    return replacement ? [{ variable: key, replacement, label: variableLabel(replacement) }] : [];
  });
  const missing = requiredVariablesForTemplate(type, format).filter(required => !variables.includes(required) && !variables.some(key => canonicalVariablePath(key) === canonicalVariablePath(required)));
  return { variables, unknown, missing, deprecated };
}

function matchesVariable(variable: TemplateVariableDefinition, key: string): boolean {
  return variable.path === key || variable.docxKey === key || variable.legacyEmailKey === key || !!variable.deprecatedAliases?.includes(key);
}
