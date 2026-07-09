import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(() => {
    service = new CurrencyService();
  });

  it('normalizes unsupported currencies to the default currency', () => {
    expect(service.normalize('USD')).toBe('USD');
    expect(service.normalize('AUD')).toBe('ZAR');
    expect(service.normalize(null)).toBe('ZAR');
  });

  it('returns currency metadata and symbols for known currencies', () => {
    expect(service.optionFor('GBP').label).toBe('British Pound');
    expect(service.symbolFor('EUR')).toBe('€');
    expect(service.symbolFor('unknown')).toBe('R');
  });

  it('formats numeric values using the selected currency locale', () => {
    expect(service.format(1234.5, 'USD')).toContain('$');
    expect(service.format(undefined as unknown as number, 'ZAR')).toContain('R');
  });
});
