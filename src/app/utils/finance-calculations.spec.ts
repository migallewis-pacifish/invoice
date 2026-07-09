import { buildAccountantCsv, calculateMonthlyProfit, calculateVatReport, invoicePaidAmount, isInvoicePaid, monthKeyFromValue, vatPortion } from './finance-calculations';

describe('finance calculations', () => {
  const invoices: any[] = [
    { id: 'i1', invoiceNumber: 'INV-1', total: 1150, amountPaid: 1150, status: 'paid', paidAt: '2026-07-15', clientId: 'c1' },
    { id: 'i2', invoiceNumber: 'INV-2', total: 230, amountPaid: 230, status: 'sent', paidAt: '2026-07-20', clientId: 'c2' },
    { id: 'i3', invoiceNumber: 'INV-3', total: 999, amountPaid: 100, status: 'partial', paidAt: '2026-07-22' },
    { id: 'i4', invoiceNumber: 'INV-4', total: 500, amountPaid: 500, status: 'paid', paidAt: '2026-06-30' }
  ];
  const expenses: any[] = [
    { id: 'e1', month: '2026-07', date: '2026-07-02', description: 'Hosting', amount: 115, clientId: null },
    { id: 'e2', month: '2026-07', date: '2026-07-03', description: 'Travel, client', amount: 230, clientId: 'c1' },
    { id: 'e3', month: '2026-06', date: '2026-06-03', description: 'Old', amount: 10 }
  ];

  it('normalizes month keys from strings and dates', () => {
    expect(monthKeyFromValue('2026-07-15')).toBe('2026-07');
    expect(monthKeyFromValue(new Date('2026-07-01T00:00:00Z'))).toBe('2026-07');
  });

  it('detects paid invoices by status or fully paid amount', () => {
    expect(isInvoicePaid(invoices[0])).toBeTrue();
    expect(isInvoicePaid(invoices[1])).toBeTrue();
    expect(isInvoicePaid(invoices[2])).toBeFalse();
  });

  it('caps paid invoice amount at total', () => {
    expect(invoicePaidAmount({ total: 100, amountPaid: 120, status: 'paid' } as any)).toBe(100);
  });

  it('calculates monthly profit from all paid client invoices and all expenses', () => {
    expect(calculateMonthlyProfit(invoices, expenses, '2026-07')).toEqual({ month: '2026-07', invoiceTotal: 1380, expenseTotal: 345, profit: 1035 });
  });

  it('calculates VAT collected, VAT paid, and net VAT from gross amounts', () => {
    expect(vatPortion(115)).toBe(15);
    expect(calculateVatReport(invoices, expenses, '2026-07')).toEqual({ vatCollected: 180, vatPaid: 45, netVat: 135 });
  });

  it('builds an accountant CSV with escaped values', () => {
    const csv = buildAccountantCsv('2026-07', invoices, expenses);
    expect(csv).toContain('Invoice,2026-07-15,INV-1,Paid invoice,1150.00,150.00,c1');
    expect(csv).toContain('Expense,2026-07-03,e2,"Travel, client",230.00,30.00,c1');
  });
});
