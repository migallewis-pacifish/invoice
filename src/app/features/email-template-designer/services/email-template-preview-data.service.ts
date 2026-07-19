import { Injectable } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class EmailTemplatePreviewDataService {
  readonly sampleData: Record<string, Record<string, string>> = {
    company: { name: 'Nexus Studio Ltd', email: 'accounts@nexus.example', phone: '+1 (555) 014-2200', address: '100 Market Street, San Francisco, CA' },
    client: { name: 'Acme Corporation', email: 'finance@acme.example' },
    invoice: { number: 'INV-2026-1042', date: 'July 19, 2026', dueDate: 'August 18, 2026', subtotal: '$4,800.00', vat: '$960.00', total: '$5,760.00' }
  };
  renderTokens(value: string): string { return value.replace(/{{\s*([\w.]+)\s*}}/g, (_, path: string) => this.lookup(path) ?? `{{${path}}}`); }
  private lookup(path: string): string | undefined { const [group, key] = path.split('.'); return this.sampleData[group]?.[key]; }
}
