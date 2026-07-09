import { calculateClientInvoiceSummary } from './client.service';
import { InvoiceRecord } from '../models/invoice.model';

describe('calculateClientInvoiceSummary', () => {
  const now = new Date('2026-07-09T12:00:00Z');

  it('totals outstanding and overdue invoice balances', () => {
    const summary = calculateClientInvoiceSummary([
      invoice({ total: 1000, amountPaid: 250, status: 'partial', dueDate: '2026-07-01' }),
      invoice({ total: 500, amountPaid: 0, status: 'sent', dueDate: '2026-07-20' }),
      invoice({ total: 300, amountPaid: 300, status: 'paid', dueDate: '2026-06-15' }),
    ], now);

    expect(summary.invoiceCount).toBe(3);
    expect(summary.outstandingBalance).toBe(1250);
    expect(summary.overdueAmount).toBe(750);
    expect(summary.nextDueDate).toBe(new Date('2026-07-20').getTime());
    expect(summary.isSettled).toBeFalse();
  });

  it('marks clients settled when invoices are fully paid', () => {
    const summary = calculateClientInvoiceSummary([
      invoice({ total: 100, amountPaid: 100, status: 'paid', dueDate: '2026-07-01' }),
      invoice({ total: 50, amountPaid: 75, status: 'sent', dueDate: '2026-07-10' }),
    ], now);

    expect(summary.outstandingBalance).toBe(0);
    expect(summary.overdueAmount).toBe(0);
    expect(summary.nextDueDate).toBeNull();
    expect(summary.isSettled).toBeTrue();
  });

  it('returns an empty settled summary when a client has no invoices', () => {
    const summary = calculateClientInvoiceSummary([], now);

    expect(summary).toEqual({
      outstandingBalance: 0,
      overdueAmount: 0,
      nextDueDate: null,
      isSettled: true,
      invoiceCount: 0,
    });
  });
});

function invoice(overrides: Pick<InvoiceRecord, 'total' | 'amountPaid' | 'status' | 'dueDate'>): InvoiceRecord {
  return {
    id: 'invoice-id',
    total: overrides.total,
    amountPaid: overrides.amountPaid,
    status: overrides.status,
    dueDate: overrides.dueDate,
  };
}
