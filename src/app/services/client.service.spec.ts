import { buildInvoiceSummaryRecord, calculateClientInvoiceSummary, mergeCompanyInvoices, mergeInvoiceTrackingUpdate } from './client.service';
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

describe('company invoice summary records', () => {
  it('uses client invoice data to fill and refresh company summaries', () => {
    const summaries = [{ id: 'invoice-1', clientId: 'client-1', total: 100, amountPaid: 0, status: 'sent' }] as any;
    const clientInvoices = [{ id: 'invoice-1', clientId: 'client-1', total: 100, amountPaid: 100, status: 'paid' }] as any;

    expect(mergeCompanyInvoices(summaries, clientInvoices)).toEqual([jasmine.objectContaining({
      id: 'invoice-1',
      amountPaid: 100,
      status: 'paid'
    })]);
  });

  it('keeps legacy client invoices when no company summary exists', () => {
    const clientInvoice = { id: 'legacy-1', clientId: 'client-2', total: 250, amountPaid: 0, status: 'sent' } as any;

    expect(mergeCompanyInvoices([], [clientInvoice])).toEqual([clientInvoice]);
  });

  it('copies invoice creation metadata into a company-level summary', () => {
    const summary = buildInvoiceSummaryRecord('invoice-1', 'client-1', {
      invoiceNumber: 'INV-001',
      filename: 'INV-001.docx',
      total: 1250,
      amountPaid: 250,
      status: 'partial',
      dueDate: '2026-07-20',
      createdAt: 123,
      updatedAt: 456,
    });

    expect(summary).toEqual({
      id: 'invoice-1',
      clientId: 'client-1',
      invoiceNumber: 'INV-001',
      filename: 'INV-001.docx',
      total: 1250,
      amountPaid: 250,
      status: 'partial',
      dueDate: '2026-07-20',
      createdAt: 123,
      updatedAt: 456,
    });
  });

  it('merges payment tracking updates without losing invoice metadata', () => {
    const currentInvoice = invoice({
      total: 1000,
      amountPaid: 100,
      status: 'partial',
      dueDate: '2026-07-20',
    });
    currentInvoice.invoiceNumber = 'INV-002';
    currentInvoice.filename = 'INV-002.docx';

    const updated = mergeInvoiceTrackingUpdate(currentInvoice, {
      amountPaid: 1000,
      status: 'paid',
      paidAt: '2026-07-09',
    });
    const summary = buildInvoiceSummaryRecord('invoice-2', 'client-2', updated);

    expect(summary).toEqual({
      id: 'invoice-2',
      clientId: 'client-2',
      invoiceNumber: 'INV-002',
      filename: 'INV-002.docx',
      total: 1000,
      amountPaid: 1000,
      status: 'paid',
      dueDate: '2026-07-20',
      paidAt: '2026-07-09',
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
