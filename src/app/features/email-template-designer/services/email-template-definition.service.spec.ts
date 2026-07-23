import { extractDesignerTemplateVariables, renderDesignedEmailPreview, toFreemarkerTemplate } from './email-template-definition.service';

describe('email template definition helpers', () => {
  it('extracts variables from stored FreeMarker templates', () => {
    expect(extractDesignerTemplateVariables('<p>${client.name}</p><p>${invoice.total}</p><p>${client.name}</p>')).toEqual(['client.name', 'invoice.total']);
  });

  it('converts designer tokens to FreeMarker', () => {
    expect(toFreemarkerTemplate('<p>{{ client.name }}</p>')).toBe('<p>${client.name}</p>');
  });

  it('renders previews and reports unresolved variables', () => {
    const preview = renderDesignedEmailPreview('<p>${client.name} owes ${invoice.total} ${invoice.missing}</p>', {
      client: { name: 'Acme' },
      invoice: { total: '$42.00' }
    });
    expect(preview.html).toContain('Acme owes $42.00');
    expect(preview.unresolved).toEqual(['invoice.missing']);
  });
});
