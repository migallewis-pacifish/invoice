import { cloneStarterEmailTemplate, createStarterEmailTemplates } from './email-template-starter-catalog';

describe('email template starter catalog', () => {
  it('includes a starter for every assignment scenario', () => {
    const scenarios = createStarterEmailTemplates().map(template => template.scenario);
    expect(new Set(scenarios)).toEqual(new Set(['invoice-sending', 'before-due-reminder', 'due-today-reminder', 'overdue-reminder', 'overdue-notice', 'letter-sending', 'general-email']));
  });

  it('clones starter templates without preserving starter ids', () => {
    const starter = createStarterEmailTemplates()[0];
    const clone = cloneStarterEmailTemplate(starter, 'company-a');
    expect(clone.companyId).toBe('company-a');
    expect(clone.id).toBeUndefined();
    expect(clone.sections[0].id).toBe(starter.sections[0].id);
    expect(clone as unknown).not.toBe(starter);
  });
});
