import { Injectable } from '@angular/core';

export type CurrencyCode = 'ZAR' | 'USD' | 'GBP' | 'EUR';

export interface CurrencyOption {
  code: CurrencyCode;
  label: string;
  symbol: string;
  locale: string;
}

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  readonly defaultCurrency: CurrencyCode = 'ZAR';

  readonly options: CurrencyOption[] = [
    { code: 'ZAR', label: 'South African Rand', symbol: 'R', locale: 'en-ZA' },
    { code: 'USD', label: 'US Dollar', symbol: '$', locale: 'en-US' },
    { code: 'GBP', label: 'British Pound', symbol: '£', locale: 'en-GB' },
    { code: 'EUR', label: 'Euro', symbol: '€', locale: 'en-IE' },
  ];

  normalize(code?: string | null): CurrencyCode {
    return this.options.some(option => option.code === code) ? code as CurrencyCode : this.defaultCurrency;
  }

  optionFor(code?: string | null): CurrencyOption {
    return this.options.find(option => option.code === this.normalize(code)) ?? this.options[0];
  }

  symbolFor(code?: string | null): string {
    return this.optionFor(code).symbol;
  }

  format(value: number, code?: string | null): string {
    const option = this.optionFor(code);
    try {
      return new Intl.NumberFormat(option.locale, { style: 'currency', currency: option.code }).format(Number(value || 0));
    } catch {
      return `${option.symbol} ${Number(value || 0).toFixed(2)}`;
    }
  }
}
