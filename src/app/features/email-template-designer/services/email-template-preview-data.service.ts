import { inject, Injectable } from '@angular/core';
import { CurrencyService } from '../../../services/currency.service';
@Injectable({ providedIn: 'root' })
export class EmailTemplatePreviewDataService {
  private readonly currencyService = inject(CurrencyService);
  readonly sampleData: Record<string, Record<string, string>> = {
    company: { name: 'Nexus Studio Ltd', email: 'accounts@nexus.example', phone: '+1 (555) 014-2200', address: '100 Market Street, San Francisco, CA' },
    client: { name: 'Acme Corporation', email: 'finance@acme.example' },
    invoice: { number: 'INV-2026-1042', date: 'July 19, 2026', dueDate: 'August 18, 2026', subtotal: '', vat: '', total: '' }
  };
  constructor() { this.useCurrency(this.currencyService.defaultCurrency); }
  useCurrency(currency: string | null | undefined): void {
    const code = this.currencyService.normalize(currency);
    this.sampleData['invoice']['subtotal'] = this.currencyService.format(4800, code);
    this.sampleData['invoice']['vat'] = this.currencyService.format(960, code);
    this.sampleData['invoice']['total'] = this.currencyService.format(5760, code);
  }
  renderTokens(value: string): string { return value.replace(/{{\s*([\w.]+)\s*}}/g, (_, path: string) => this.lookup(path) ?? `{{${path}}}`); }
  private lookup(path: string): string | undefined { const [group, key] = path.split('.'); return this.sampleData[group]?.[key]; }
}
