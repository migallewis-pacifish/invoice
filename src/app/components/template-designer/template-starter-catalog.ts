import { EmailColumn, EmailColumnStyles, EmailElement, EmailSection, EmailTemplateDefinition, EmailTemplateScenario, EmailTemplateType } from '../../models/email-template-designer.model';
import { TemplatePalette } from '../template-colour-selector/template-colour-selector.component';

export type StarterTemplate = Omit<EmailTemplateDefinition, 'companyId'> & {
  description: string;
  accent: string;
  audience: string;
  scenario: EmailTemplateScenario;
  sourcePath: string;
  palette: TemplatePalette;
};

const columnStyles = (): EmailColumnStyles => ({ backgroundColor: '#ffffff', verticalAlign: 'top', paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, borderColor: '#dbe3eb', borderWidth: 0, borderRadius: 0 });
const text = (content: string, size = 16, weight = '400', color = '#172033', align: 'left'|'center'|'right' = 'left', background = '#ffffff'): EmailElement => ({ id: crypto.randomUUID(), type: 'text', content, styles: { fontSize: size, fontWeight: weight, fontStyle: 'normal', textAlign: align, color, backgroundColor: background, lineHeight: 1.5, paddingTop: 8, paddingRight: 8, paddingBottom: 8, paddingLeft: 8 } });
const spacer = (height: number): EmailElement => ({ id: crypto.randomUUID(), type: 'spacer', height });
const column = (elements: EmailElement[], backgroundColor = '#ffffff'): EmailColumn => ({ id: crypto.randomUUID(), styles: { ...columnStyles(), backgroundColor }, elements });
const section = (columns: EmailColumn[], widths: number[], backgroundColor = '#ffffff', top = 24, bottom = 24): EmailSection => ({ id: crypto.randomUUID(), type: 'layout', columnWidths: widths, styles: { backgroundColor, contentWidth: 600, columnGap: 16, paddingTop: top, paddingRight: 28, paddingBottom: bottom, paddingLeft: 28 }, columns });

function starter(id: string, name: string, description: string, audience: string, palette: TemplatePalette, sections: EmailSection[]): StarterTemplate {
  return {
    schemaVersion: 1, id, name, description, audience, palette, accent: palette[0],
    sourcePath: `/templates/email/${id}.ftl`, type: 'general', scenario: 'general-email',
    subject: 'Update from {{company.name}} for {{client.name}}', sections
  };
}

/** The starter list mirrors the FreeMarker files in public/templates/email. */
export function createStarterTemplates(): StarterTemplate[] {
  const intro = 'Hi {{client.name}},\n\nAdd your message here. Keep the important details clear and easy to scan.';
  const signoff = 'Kind regards,\n{{company.name}}';
  return [
    starter('01-letterhead', 'Letterhead', 'A restrained masthead and generous single-column reading area.', 'General correspondence', ['#243b53', '#526d82', '#e8eef3'], [
      section([column([text('{{company.name}}', 24, '700', '#ffffff', 'left', '#243b53')], '#243b53')], [100], '#243b53', 20, 20),
      section([column([text(intro), spacer(18), text(signoff, 15, '600')])], [100])
    ]),
    starter('02-split-header', 'Split header', 'A two-part header separates the brand from the message context.', 'Invoices and updates', ['#164e63', '#0e7490', '#cffafe'], [
      section([column([text('{{company.name}}', 21, '700', '#ffffff', 'left', '#164e63')], '#164e63'), column([text('CLIENT UPDATE', 12, '700', '#164e63', 'right', '#cffafe')], '#cffafe')], [60, 40], '#164e63', 18, 18),
      section([column([text('The details at a glance', 25, '700', '#164e63'), text(intro), spacer(14), text(signoff, 15, '600')])], [100])
    ]),
    starter('03-sidebar-note', 'Sidebar note', 'A narrow information rail supports a spacious primary message.', 'Detailed messages', ['#334155', '#64748b', '#e2e8f0'], [
      section([column([text('FROM', 11, '700', '#ffffff', 'left', '#334155'), text('{{company.name}}\n{{company.email}}\n{{company.phone}}', 14, '400', '#ffffff', 'left', '#334155')], '#334155'), column([text('Hello {{client.name}}', 25, '700'), text('Add a descriptive heading', 17, '600', '#64748b'), text(intro), spacer(14), text(signoff, 15, '600')])], [32, 68], '#ffffff', 0, 0)
    ]),
    starter('04-centred-card', 'Centred card', 'A focused card layout for short announcements and thank-you notes.', 'Announcements', ['#4338ca', '#6366f1', '#e0e7ff'], [
      section([column([spacer(12), text('{{company.name}}', 17, '700', '#4338ca', 'center', '#e0e7ff'), text('A short message with impact', 27, '700', '#172033', 'center'), text(intro, 16, '400', '#172033', 'center'), spacer(10), text(signoff, 14, '600', '#4338ca', 'center')], '#ffffff')], [100], '#e0e7ff', 36, 36)
    ]),
    starter('05-editorial', 'Editorial', 'Strong typography and a numbered detail row create a magazine-like rhythm.', 'Project handoffs', ['#3f3f46', '#71717a', '#e4e4e7'], [
      section([column([text('{{company.name}}  /  UPDATE', 12, '700', '#71717a'), text('Everything you need, in one place', 31, '700', '#3f3f46'), text(intro)])], [100], '#ffffff', 34, 18),
      section([column([text('01\nReview the details', 14, '600', '#3f3f46', 'left', '#e4e4e7')], '#e4e4e7'), column([text('02\nReply with questions', 14, '600', '#3f3f46', 'left', '#e4e4e7')], '#e4e4e7')], [50, 50], '#e4e4e7', 18, 18),
      section([column([text(signoff, 15, '600')])], [100], '#ffffff', 18, 26)
    ]),
    starter('06-receipt', 'Receipt', 'A compact summary block makes transactional information easy to find.', 'Payment messages', ['#14532d', '#16a34a', '#dcfce7'], [
      section([column([text('PAYMENT UPDATE', 11, '700', '#14532d', 'left', '#dcfce7'), text('Thank you, {{client.name}}', 27, '700', '#14532d', 'left', '#dcfce7')], '#dcfce7')], [100], '#dcfce7', 22, 22),
      section([column([text(intro), spacer(12), text('Invoice', 12, '700', '#16a34a'), text('{{invoice.number}}', 18, '700')]), column([text('Amount', 12, '700', '#16a34a'), text('{{invoice.total}}', 18, '700'), text('Due date', 12, '700', '#16a34a'), text('{{invoice.dueDate}}', 16, '600')])], [58, 42]),
      section([column([text(signoff, 15, '600', '#ffffff', 'left', '#14532d')], '#14532d')], [100], '#14532d', 16, 16)
    ])
  ];
}

export function applyStarterPalette(starter: StarterTemplate, palette: TemplatePalette): StarterTemplate {
  const copy = structuredClone(starter);
  const replacements = new Map(starter.palette.map((colour, index) => [colour.toLowerCase(), palette[index]]));
  copy.palette = [...palette]; copy.accent = palette[0];
  for (const item of copy.sections) {
    item.styles.backgroundColor = replacements.get(item.styles.backgroundColor.toLowerCase()) ?? item.styles.backgroundColor;
    for (const col of item.columns) {
      col.styles.backgroundColor = replacements.get(col.styles.backgroundColor.toLowerCase()) ?? col.styles.backgroundColor;
      col.styles.borderColor = replacements.get(col.styles.borderColor.toLowerCase()) ?? col.styles.borderColor;
      for (const element of col.elements) if (element.type === 'text') {
        element.styles.color = replacements.get(element.styles.color.toLowerCase()) ?? element.styles.color;
        element.styles.backgroundColor = replacements.get(element.styles.backgroundColor.toLowerCase()) ?? element.styles.backgroundColor;
      }
    }
  }
  return copy;
}

export function cloneStarterTemplate(starter: StarterTemplate, companyId: string): EmailTemplateDefinition {
  const { description: _description, accent: _accent, audience: _audience, sourcePath: _sourcePath, palette: _palette, ...definition } = structuredClone(starter);
  return { ...definition, companyId, id: undefined, createdAt: undefined, updatedAt: undefined };
}

export const createStarterEmailTemplates = createStarterTemplates;
export const cloneStarterEmailTemplate = cloneStarterTemplate;
export type StarterEmailTemplate = StarterTemplate;
