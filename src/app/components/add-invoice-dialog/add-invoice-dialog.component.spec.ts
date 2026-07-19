import { buildPaymentHistoryEntries, resolveTrackedAmountPaid, resolveTrackedInvoiceStatus } from './add-invoice-dialog.component';
import { Timestamp } from 'firebase/firestore';

describe('invoice payment tracking resolution', () => {
  const today = new Date('2026-07-09T12:00:00Z');

  it('keeps unpaid sent invoices as sent with no payment', () => {
    const amountPaid = resolveTrackedAmountPaid('sent', 100, 0);
    const status = resolveTrackedInvoiceStatus('sent', 100, amountPaid, '2026-07-20', {}, today);

    expect(amountPaid).toBe(0);
    expect(status).toBe('sent');
  });

  it('marks invoices as partial when some payment is recorded', () => {
    const amountPaid = resolveTrackedAmountPaid('partial', 100, 40);
    const status = resolveTrackedInvoiceStatus('partial', 100, amountPaid, '2026-07-20', {}, today);

    expect(amountPaid).toBe(40);
    expect(status).toBe('partial');
  });

  it('caps regular partial payments at the invoice total and marks them paid', () => {
    const amountPaid = resolveTrackedAmountPaid('partial', 100, 150);
    const status = resolveTrackedInvoiceStatus('partial', 100, amountPaid, '2026-07-20', {}, today);

    expect(amountPaid).toBe(100);
    expect(status).toBe('paid');
  });

  it('marks unpaid past-due invoices as overdue', () => {
    const amountPaid = resolveTrackedAmountPaid('sent', 100, 0);
    const status = resolveTrackedInvoiceStatus('sent', 100, amountPaid, '2026-07-01', {}, today);

    expect(amountPaid).toBe(0);
    expect(status).toBe('overdue');
  });

  it('allows overpayment when credit handling is enabled', () => {
    const amountPaid = resolveTrackedAmountPaid('partial', 100, 150, { creditAmount: 50 });
    const status = resolveTrackedInvoiceStatus('partial', 100, amountPaid, '2026-07-20', { creditAmount: 50 }, today);

    expect(amountPaid).toBe(150);
    expect(status).toBe('credited');
  });

  it('marks invoices as overpaid when an overpaid status is selected', () => {
    const amountPaid = resolveTrackedAmountPaid('overpaid', 100, 125);
    const status = resolveTrackedInvoiceStatus('overpaid', 100, amountPaid, '2026-07-20', {}, today);

    expect(amountPaid).toBe(125);
    expect(status).toBe('overpaid');
  });

  it('marks invoices as refunded when refund handling is enabled', () => {
    const amountPaid = resolveTrackedAmountPaid('partial', 100, 125, { refundAmount: 25 });
    const status = resolveTrackedInvoiceStatus('partial', 100, amountPaid, '2026-07-20', { refundAmount: 25 }, today);

    expect(amountPaid).toBe(125);
    expect(status).toBe('refunded');
  });
});

describe('invoice payment history', () => {
  it('uses concrete timestamps that Firestore supports inside arrays', () => {
    const createdAt = Timestamp.fromDate(new Date('2026-07-09T12:00:00Z'));
    const history = buildPaymentHistoryEntries(100, 0, 0, 'user-1', createdAt);

    expect(history).toEqual([{
      type: 'payment',
      amount: 100,
      createdAt,
      createdBy: 'user-1'
    }]);
    expect(history[0].createdAt instanceof Timestamp).toBeTrue();
  });

  it('does not write an undefined createdBy value', () => {
    const [entry] = buildPaymentHistoryEntries(100, 0, 0);

    expect(Object.prototype.hasOwnProperty.call(entry, 'createdBy')).toBeFalse();
  });
});
