import { filterTemplates, TemplateCard } from './templates.component';

describe('TemplatesComponent helpers', () => {
  const templates: TemplateCard[] = [
    card('invoice-1', 'invoice', false),
    card('letter-1', 'letter', false),
    card('invoice-archived', 'invoice', true)
  ];

  it('filters active templates without archived templates', () => {
    expect(filterTemplates(templates, 'active').map(template => template.id)).toEqual(['invoice-1', 'letter-1']);
  });

  it('filters archived templates separately', () => {
    expect(filterTemplates(templates, 'archived').map(template => template.id)).toEqual(['invoice-archived']);
  });

  it('filters invoice and letter templates without archived records', () => {
    expect(filterTemplates(templates, 'invoice').map(template => template.id)).toEqual(['invoice-1']);
    expect(filterTemplates(templates, 'letter').map(template => template.id)).toEqual(['letter-1']);
  });
});

function card(id: string, type: 'invoice' | 'letter', archived: boolean): TemplateCard {
  return {
    id,
    companyId: 'company-a',
    type,
    name: id,
    storagePath: `${id}.docx`,
    fileUrl: `${id}.docx`,
    category: type,
    description: id,
    active: !archived,
    archived,
    accent: type
  };
}
