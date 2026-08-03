import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DocumentTemplatePreviewService {
  private readonly sampleValues: Record<string, string> = {
    'company.name': 'Nexus Studio Ltd', 'company.address': '100 Market Street, Johannesburg', 'company.email': 'accounts@nexus.example',
    'company.phone': '+27 11 555 0100', 'company.website': 'www.nexus.example', 'company.registrationNumber': '2026/123456/07', 'company.taxNumber': '4123456789',
    'client.name': 'Acme Corporation', 'client.address': '42 Client Avenue, Sandton', 'client.street': '42 Client Avenue', 'client.suburb': 'Sandton',
    'client.city': 'Johannesburg', 'client.postalCode': '2196', 'client.email': 'finance@acme.example',
    'invoice.number': 'INV-2026-1042', 'invoice.date': '3 August 2026', 'invoice.dueDate': '2 September 2026',
    'invoice.subtotal': 'R 4,800.00', 'invoice.vatPercentage': '15', 'invoice.vat': 'R 720.00', 'invoice.total': 'R 5,520.00', 'invoice.notes': 'Thank you for your business.',
    'item.description': 'Professional services', 'item.hours': '8', 'item.rate': 'R 600.00', 'item.amount': 'R 4,800.00',
    'payment.reference': 'INV-2026-1042', 'payment.bankName': 'Example Bank', 'payment.accountHolder': 'Nexus Studio Ltd',
    'payment.accountType': 'Business', 'payment.accountNumber': '1234567890', 'payment.branchCode': '123456', 'signature.name': 'Alex Morgan'
  };

  buildHtml(source: string): string {
    return this.renderConditionals(source)
      .replace(/\$\{\(theme\.sidebarColor[123]\)!'([^']+)'}/g, '$1')
      .replace(/<#--[\s\S]*?-->/g, '')
      .replace(/<#[^>]*>/g, '')
      .replace(/<\/#list>/g, '')
      .replace(/\$\{([^}]+)}/g, (_match, expression: string) => {
        const path = Object.keys(this.sampleValues).find(key => expression.includes(key));
        return path ? this.sampleValues[path] : '';
      });
  }

  private renderConditionals(source: string): string {
    const directive = /<#if\s+([^>]+)>|<\/#if>/g;
    const activeConditions: boolean[] = [];
    let output = '';
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = directive.exec(source))) {
      if (activeConditions.every(Boolean)) output += source.slice(cursor, match.index);
      if (match[1] !== undefined) activeConditions.push(this.evaluateCondition(match[1]));
      else activeConditions.pop();
      cursor = directive.lastIndex;
    }
    if (activeConditions.every(Boolean)) output += source.slice(cursor);
    return output;
  }

  private evaluateCondition(expression: string): boolean {
    return expression.split('||').some(orPart => orPart.split('&&').every(andPart => {
      const match = andPart.trim().match(/^\(?\s*([a-zA-Z0-9_.]+)\s*\)?\?has_content$/);
      if (!match) return false;
      return !!this.sampleValues[match[1]]?.trim();
    }));
  }
}
