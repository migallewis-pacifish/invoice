import { cloneStarterTemplate, createStarterTemplates } from './template-starter-catalog';

describe('template starter catalog', () => {
  it('includes a starter for every assignment scenario', () => {
    const scenarios = createStarterTemplates().map(template => template.scenario);
    expect(new Set(scenarios)).toEqual(new Set(['invoice-sending', 'before-due-reminder', 'due-today-reminder', 'overdue-reminder', 'overdue-notice', 'letter-sending', 'general-email']));
  });

  it('clones starter templates without preserving starter ids', () => {
    const starter = createStarterTemplates()[0];
    const clone = cloneStarterTemplate(starter, 'company-a');
    expect(clone.companyId).toBe('company-a');
    expect(clone.id).toBeUndefined();
    expect(clone.sections[0].id).toBe(starter.sections[0].id);
    expect(clone as unknown).not.toBe(starter);
  });

  it('offers several starters for invoice, overdue, handoff, and thank-you emails', () => {
    const templates = createStarterTemplates();
    const ids = templates.map(template => template.id ?? '');

    expect(ids.filter(id => id.startsWith('invoice-')).length).toBeGreaterThanOrEqual(3);
    expect(ids.filter(id => id.startsWith('overdue-') || id.startsWith('reminder-overdue')).length).toBeGreaterThanOrEqual(3);
    expect(ids.filter(id => id.startsWith('handoff-')).length).toBeGreaterThanOrEqual(3);
    expect(ids.filter(id => id.startsWith('thanks-') || id === 'general-thanks').length).toBeGreaterThanOrEqual(3);
  });
});
