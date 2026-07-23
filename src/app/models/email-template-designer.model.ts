export type EmailTemplateType = 'invoice' | 'payment-reminder' | 'letter' | 'general';
export type EmailTemplateScenario = 'invoice-sending' | 'before-due-reminder' | 'due-today-reminder' | 'overdue-reminder' | 'overdue-notice' | 'letter-sending' | 'general-email';
export type EmailElementType = 'text' | 'image' | 'spacer' | 'variable';
export type EmailSelection = { kind: 'section'; sectionId: string } | { kind: 'column'; sectionId: string; columnId: string } | { kind: 'element'; sectionId: string; columnId: string; elementId: string } | null;
export type EmailTextAlign = 'left' | 'center' | 'right';

export interface EmailTemplateDefinition {
  schemaVersion: 1;
  id?: string;
  companyId: string;
  name: string;
  subject: string;
  type: EmailTemplateType;
  sections: EmailSection[];
  scenario?: EmailTemplateScenario;
  defaultForScenarios?: EmailTemplateScenario[];
  archived?: boolean;
  freemarkerStoragePath?: string;
  variables?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}
export interface EmailSection { id: string; type: 'layout'; columnWidths: number[]; styles: EmailSectionStyles; columns: EmailColumn[]; }
export interface EmailColumn { id: string; elements: EmailElement[]; styles: EmailColumnStyles; }
export interface EmailColumnStyles { backgroundColor: string; verticalAlign: 'top' | 'middle' | 'bottom'; paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number; borderColor: string; borderWidth: number; borderRadius: number; }
export interface EmailSectionStyles { backgroundColor: string; contentWidth: number; columnGap: number; paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number; }
export interface EmailElementBase { id: string; type: EmailElementType; }
export interface EmailTextElement extends EmailElementBase { type: 'text'; content: string; styles: EmailTextStyles; }
export interface EmailTextStyles { fontSize: number; fontWeight: string; fontStyle: 'normal' | 'italic'; textAlign: EmailTextAlign; color: string; backgroundColor: string; lineHeight: number; paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number; }
export interface EmailImageElement extends EmailElementBase { type: 'image'; url: string; alt: string; widthPercent: number; alignment: EmailTextAlign; linkUrl?: string; borderRadius: number; }
export interface EmailSpacerElement extends EmailElementBase { type: 'spacer'; height: number; }
export interface EmailVariableElement extends EmailElementBase { type: 'variable'; path: string; token: string; }
export type EmailElement = EmailTextElement | EmailImageElement | EmailSpacerElement | EmailVariableElement;
export interface EmailPaletteItem { kind: 'layout' | 'element'; label: string; description?: string; columnWidths?: number[]; elementType?: EmailElementType; variablePath?: string; }
export interface EmailVariableDefinition { group: 'Company' | 'Client' | 'Invoice'; path: string; label: string; token: string; }
