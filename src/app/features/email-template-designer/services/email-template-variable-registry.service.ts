import { Injectable } from '@angular/core';
import { EmailVariableDefinition } from '../../../models/email-template-designer.model';

@Injectable({ providedIn: 'root' })
export class EmailTemplateVariableRegistryService {
  readonly variables: EmailVariableDefinition[] = [
    { group: 'Company', path: 'company.name', label: 'Company name', token: '{{company.name}}' },
    { group: 'Company', path: 'company.email', label: 'Company email', token: '{{company.email}}' },
    { group: 'Company', path: 'company.phone', label: 'Company phone', token: '{{company.phone}}' },
    { group: 'Company', path: 'company.address', label: 'Company address', token: '{{company.address}}' },
    { group: 'Client', path: 'client.name', label: 'Client name', token: '{{client.name}}' },
    { group: 'Client', path: 'client.email', label: 'Client email', token: '{{client.email}}' },
    { group: 'Invoice', path: 'invoice.number', label: 'Invoice number', token: '{{invoice.number}}' },
    { group: 'Invoice', path: 'invoice.date', label: 'Invoice date', token: '{{invoice.date}}' },
    { group: 'Invoice', path: 'invoice.dueDate', label: 'Invoice due date', token: '{{invoice.dueDate}}' },
    { group: 'Invoice', path: 'invoice.subtotal', label: 'Invoice subtotal', token: '{{invoice.subtotal}}' },
    { group: 'Invoice', path: 'invoice.vat', label: 'Invoice VAT', token: '{{invoice.vat}}' },
    { group: 'Invoice', path: 'invoice.total', label: 'Invoice total', token: '{{invoice.total}}' }
  ];
  groupedVariables() { return ['Company', 'Client', 'Invoice'].map(group => ({ group, variables: this.variables.filter(v => v.group === group) })); }
  tokenFor(path: string): string { return this.variables.find(v => v.path === path)?.token ?? `{{${path}}}`; }
}
