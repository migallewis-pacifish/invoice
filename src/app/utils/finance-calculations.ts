import { Expense } from '../models/expense.model';
import { InvoiceRecord } from '../models/invoice.model';

export interface MonthlyProfitSummary {
  month: string;
  invoiceTotal: number;
  expenseTotal: number;
  profit: number;
}

export interface VatReport {
  vatCollected: number;
  vatPaid: number;
  netVat: number;
}

const VAT_RATE = 0.15;

export function monthKeyFromValue(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 7);
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function isInvoicePaid(invoice: InvoiceRecord): boolean {
  const total = Number(invoice.total) || 0;
  const amountPaid = Number(invoice.amountPaid) || 0;
  return invoice.status === 'paid' || (total > 0 && amountPaid >= total);
}

export function invoicePaidAmount(invoice: InvoiceRecord): number {
  if (!isInvoicePaid(invoice)) return 0;
  const total = Number(invoice.total) || 0;
  const amountPaid = Number(invoice.amountPaid) || 0;
  return amountPaid > 0 ? Math.min(amountPaid, total) : total;
}

export function calculateMonthlyProfit(invoices: InvoiceRecord[], expenses: Expense[], month: string): MonthlyProfitSummary {
  const invoiceTotal = invoices
    .filter(invoice => isInvoicePaid(invoice) && monthKeyFromValue(invoice.paidAt || invoice.date || invoice.createdAt) === month)
    .reduce((sum, invoice) => sum + invoicePaidAmount(invoice), 0);
  const expenseTotal = expenses
    .filter(expense => (expense.month || monthKeyFromValue(expense.date)) === month)
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return roundMoney({ month, invoiceTotal, expenseTotal, profit: invoiceTotal - expenseTotal });
}

export function calculateVatReport(invoices: InvoiceRecord[], expenses: Expense[], month: string, vatRate = VAT_RATE): VatReport {
  const vatCollected = invoices
    .filter(invoice => isInvoicePaid(invoice) && monthKeyFromValue(invoice.paidAt || invoice.date || invoice.createdAt) === month)
    .reduce((sum, invoice) => sum + vatPortion(invoicePaidAmount(invoice), vatRate), 0);
  const vatPaid = expenses
    .filter(expense => (expense.month || monthKeyFromValue(expense.date)) === month)
    .reduce((sum, expense) => sum + vatPortion(Number(expense.amount) || 0, vatRate), 0);
  return roundMoney({ vatCollected, vatPaid, netVat: vatCollected - vatPaid });
}

export function vatPortion(grossAmount: number, vatRate = VAT_RATE): number {
  return +(grossAmount - grossAmount / (1 + vatRate)).toFixed(2);
}

export function buildAccountantCsv(month: string, invoices: InvoiceRecord[], expenses: Expense[]): string {
  const rows = [
    ['Type', 'Date', 'Reference', 'Description', 'Amount', 'VAT', 'Client ID'],
    ...invoices.filter(i => isInvoicePaid(i) && monthKeyFromValue(i.paidAt || i.date || i.createdAt) === month)
      .map(i => ['Invoice', dateString(i.paidAt || i.date || i.createdAt), i.invoiceNumber || i.id || '', 'Paid invoice', invoicePaidAmount(i).toFixed(2), vatPortion(invoicePaidAmount(i)).toFixed(2), (i as any).clientId || '']),
    ...expenses.filter(e => (e.month || monthKeyFromValue(e.date)) === month)
      .map(e => ['Expense', e.date || '', e.id || '', e.description || '', (Number(e.amount) || 0).toFixed(2), vatPortion(Number(e.amount) || 0).toFixed(2), e.clientId || ''])
  ];
  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

function csvEscape(value: any): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dateString(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function roundMoney<T extends Record<string, any>>(value: T): T {
  const writable = value as Record<string, any>;
  for (const key of Object.keys(writable)) {
    if (typeof writable[key] === 'number') writable[key] = +writable[key].toFixed(2);
  }
  return value;
}
