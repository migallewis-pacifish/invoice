import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DocumentTemplatePreviewService {
  private readonly sampleValues: Record<string, string> = {
    'company.name': 'Pacifish Consulting (Pty) Ltd',
    'company.address': 'Harbour House, 12 Marine Drive, Cape Town, 8001',
    'company.address.building': 'Harbour House', 'company.address.line1': '12 Marine Drive', 'company.address.line2': 'Suite 4',
    'company.address.suburb': 'Foreshore', 'company.address.city': 'Cape Town', 'company.address.province': 'Western Cape',
    'company.address.postalCode': '8001', 'company.address.country': 'South Africa',
    'company.email': 'accounts@pacifish.example', 'company.phone': '+2721 555 0142', 'company.website': 'www.pacifish.example',
    'company.registrationNumber': '2026/123456/07', 'company.taxNumber': '4123456789',
    'client.title': 'Ms', 'client.name': 'Naledi Mokoena', 'client.address': 'Nexus House, 42 Rivonia Road, Sandton, 2196',
    'client.address.building': 'Nexus House', 'client.address.line1': '42 Rivonia Road', 'client.address.line2': 'Third Floor',
    'client.address.suburb': 'Sandton', 'client.address.city': 'Johannesburg', 'client.address.province': 'Gauteng',
    'client.address.postalCode': '2196', 'client.address.country': 'South Africa',
    'client.street': '42 Rivonia Road', 'client.suburb': 'Sandton', 'client.city': 'Johannesburg', 'client.postalCode': '2196',
    'client.email': 'naledi@nexus.example', 'client.phone': '082 555 0187',
    'invoice.number': 'PAC-2026-1042', 'invoice.date': '6 August 2026', 'invoice.dueDate': '5 September 2026',
    'invoice.subtotal': 'R 12,000.00', 'invoice.vatPercentage': '15', 'invoice.vat': 'R 1,800.00', 'invoice.total': 'R 13,800.00',
    'invoice.notes': 'Thank you for choosing Pacifish.',
    'letter.title': 'Project update and next steps', 'letter.date': '6 August 2026',
    'letter.message': 'Dear Naledi,\n\nThank you for partnering with Pacifish Consulting. We are pleased to share the latest project update and the next steps for your team.',
    'letter.signedBy': 'Mia Daniels', 'letter.signatureUrl': '',
    'message.body': 'Please find the latest update from the Pacifish team. Review the details below and contact us if you have any questions.',
    'item.description': 'Nexus platform consulting and support', 'item.hours': '20', 'item.rate': 'R 600.00', 'item.amount': 'R 12,000.00',
    'payment.reference': 'PAC-2026-1042', 'payment.bankName': 'Nexus Bank', 'payment.accountHolder': 'Pacifish Consulting (Pty) Ltd',
    'payment.accountType': 'Business Cheque', 'payment.accountNumber': '1234567890', 'payment.branchCode': '250655', 'signature.name': 'Mia Daniels'
  };

  buildHtml(source: string, overrides: Record<string, string> = {}): string {
    const values = { ...this.sampleValues, ...overrides };
    return this.renderConditionals(source, values)
      .replace(/\$\{\(theme\.sidebarColor[123]\)!'([^']+)'}/g, '$1')
      .replace(/<#--[\s\S]*?-->/g, '')
      .replace(/<#[^>]*>/g, '')
      .replace(/<\/#list>/g, '')
      .replace(/\$\{([^}]+)}/g, (_match, expression: string) => {
        const path = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+/)?.[0];
        const value = path ? values[path] ?? '' : '';
        return expression.includes('?html') && path !== 'letter.message' ? this.escapeHtml(value) : value;
      });
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
  }

  private renderConditionals(source: string, values: Record<string, string>): string {
    const directive = /<#if\s+([^>]+)>|<\/#if>/g;
    const activeConditions: boolean[] = [];
    let output = '';
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = directive.exec(source))) {
      if (activeConditions.every(Boolean)) output += source.slice(cursor, match.index);
      if (match[1] !== undefined) activeConditions.push(this.evaluateCondition(match[1], values));
      else activeConditions.pop();
      cursor = directive.lastIndex;
    }
    if (activeConditions.every(Boolean)) output += source.slice(cursor);
    return output;
  }

  private evaluateCondition(expression: string, values: Record<string, string>): boolean {
    return expression.split('||').some(orPart => orPart.split('&&').every(andPart => {
      const match = andPart.trim().match(/^\(?\s*([a-zA-Z0-9_.]+)\s*\)?\?has_content$/);
      if (!match) return false;
      return !!values[match[1]]?.trim();
    }));
  }
}
