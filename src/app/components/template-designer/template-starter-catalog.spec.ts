import { applyStarterPalette, createStarterTemplates } from './template-starter-catalog';

describe('email starter catalog', () => {
  it('maps every selection to a FreeMarker email template', () => {
    const starters = createStarterTemplates();

    expect(starters.length).toBe(6);
    expect(starters.every(starter => starter.sourcePath === `/templates/email/${starter.id}.ftl`)).toBeTrue();
  });

  it('applies user colours without mutating the catalog template', () => {
    const starter = createStarterTemplates()[0];
    const themed = applyStarterPalette(starter, ['#111111', '#222222', '#333333']);

    expect(themed.palette).toEqual(['#111111', '#222222', '#333333']);
    expect(themed.sections[0].styles.backgroundColor).toBe('#111111');
    expect(starter.sections[0].styles.backgroundColor).toBe(starter.palette[0]);
  });
});
