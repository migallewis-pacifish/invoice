import { filterAndSortClients } from './client-list.component';
import { formatClientsCsv } from '../../utils/client-csv';
import { Client } from '../../models/client.model';
import { ClientInvoiceSummary } from '../../services/client.service';

describe('ClientListComponent list helpers', () => {
  const clients: Client[] = [
    client({ id: 'c1', displayName: 'Acme Holdings', status: 'active', relationshipType: 'enterprise', email: 'billing@acme.test', phone: '555-0101' }),
    client({ id: 'c2', displayName: 'Beta Studio', status: 'inactive', clientType: 'partner', email: 'hello@beta.test', phone: '555-0102' }),
    client({ id: 'c3', displayName: 'Capital Partners', status: 'prospect', relationshipType: 'enterprise', email: 'ops@capital.test', phone: '555-0103' }),
  ];

  const summaries: Record<string, ClientInvoiceSummary> = {
    c1: summary(200),
    c2: summary(1250),
    c3: summary(25),
  };

  it('applies search, status, and relationship filters together', () => {
    const result = filterAndSortClients(clients, summaries, {
      searchTerm: 'capital',
      status: 'prospect',
      relationshipType: 'enterprise',
      sortField: 'displayName',
      sortDirection: 'asc',
    });

    expect(result.map(item => item.client.id)).toEqual(['c3']);
    expect(result[0].invoiceSummary?.outstandingBalance).toBe(25);
  });

  it('sorts clients by balance descending', () => {
    const result = filterAndSortClients(clients, summaries, {
      searchTerm: '',
      status: 'all',
      relationshipType: 'all',
      sortField: 'balance',
      sortDirection: 'desc',
    });

    expect(result.map(item => item.client.id)).toEqual(['c2', 'c1', 'c3']);
  });

  it('formats client exports as escaped CSV rows', () => {
    const csv = formatClientsCsv([
      {
        client: client({ id: 'c4', displayName: 'Comma, Quote " Co', status: 'active', relationshipType: 'enterprise', email: 'csv@example.test' }),
        invoiceSummary: summary(99.5, 25, 3),
      },
    ]);

    expect(csv).toContain('Client ID,Display Name,Status,Relationship Type,Client Type,Email,Phone,City,VAT Number,Outstanding Balance,Overdue Amount,Invoice Count');
    expect(csv).toContain('c4,"Comma, Quote "" Co",active,enterprise,,csv@example.test,,');
    expect(csv.endsWith('99.5,25,3')).toBeTrue();
  });
});

function client(overrides: Partial<Client>): Client {
  return {
    id: 'client-id',
    displayName: 'Client',
    createdAt: 0,
    ...overrides,
  };
}

function summary(outstandingBalance: number, overdueAmount = 0, invoiceCount = 1): ClientInvoiceSummary {
  return {
    outstandingBalance,
    overdueAmount,
    invoiceCount,
    isSettled: outstandingBalance <= 0,
    nextDueDate: null,
  };
}
