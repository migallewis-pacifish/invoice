/**
 * Public model surface for the shared email, invoice, and letter template designer.
 * The source aliases preserve compatibility with existing Firestore email-template records.
 */
export type {
  EmailColumn as TemplateColumn,
  EmailColumnStyles as TemplateColumnStyles,
  EmailElement as TemplateElement,
  EmailElementType as TemplateElementType,
  EmailImageElement as TemplateImageElement,
  EmailPaletteItem as TemplatePaletteItem,
  EmailSection as TemplateSection,
  EmailSectionStyles as TemplateSectionStyles,
  EmailSelection as TemplateSelection,
  EmailSpacerElement as TemplateSpacerElement,
  EmailTemplateDefinition as TemplateDefinition,
  EmailTemplateScenario as TemplateScenario,
  EmailTemplateType as TemplateType,
  EmailTextAlign as TemplateTextAlign,
  EmailTextElement as TemplateTextElement,
  EmailTextStyles as TemplateTextStyles,
  EmailVariableDefinition as TemplateVariableDefinition,
  EmailVariableElement as TemplateVariableElement
} from './email-template-designer.model';
