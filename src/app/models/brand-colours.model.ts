import { CompanyTemplateTheme } from './invoice.model';

export const DEFAULT_BRAND_COLORS: CompanyTemplateTheme = {
  primary: '#2563eb',
  secondary: '#1e3a8a',
  accent: '#60a5fa'
};

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function brandColorsFrom(value: unknown): CompanyTemplateTheme | null {
  const colors = value as Partial<CompanyTemplateTheme> | null | undefined;
  return colors && isHexColour(colors.primary) && isHexColour(colors.secondary) && isHexColour(colors.accent)
    ? { primary: colors.primary, secondary: colors.secondary, accent: colors.accent }
    : null;
}
