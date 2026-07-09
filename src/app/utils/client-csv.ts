import { Client } from '../models/client.model';
import { ClientInvoiceSummary } from '../services/client.service';

export interface ClientCsvRow {
  client: Client;
  invoiceSummary?: ClientInvoiceSummary;
}

const CSV_HEADERS = [
  'Client ID',
  'Display Name',
  'Status',
  'Relationship Type',
  'Client Type',
  'Email',
  'Phone',
  'City',
  'VAT Number',
  'Outstanding Balance',
  'Overdue Amount',
  'Invoice Count',
];

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatClientsCsv(rows: ClientCsvRow[]): string {
  const lines = rows.map(({ client, invoiceSummary }) => [
    client.id,
    client.displayName,
    client.status || 'active',
    client.relationshipType || '',
    client.clientType || '',
    client.email || '',
    client.phone || '',
    client.address?.city || '',
    client.vatNo || '',
    invoiceSummary?.outstandingBalance ?? 0,
    invoiceSummary?.overdueAmount ?? 0,
    invoiceSummary?.invoiceCount ?? 0,
  ].map(csvEscape).join(','));

  return [CSV_HEADERS.join(','), ...lines].join('\n');
}

export function downloadClientsCsv(rows: ClientCsvRow[], filename = 'clients.csv'): void {
  const csv = formatClientsCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
