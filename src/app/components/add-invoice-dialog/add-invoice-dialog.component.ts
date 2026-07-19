import { DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { CommonModule } from '@angular/common';
import { InvoiceDocxService } from '../../services/invoice-docx.service';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { catchError, finalize, from, map, of, switchMap, take, tap } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { doc, docData, Firestore, serverTimestamp } from '@angular/fire/firestore';
import { CurrencyService } from '../../services/currency.service';
import { NotificationService } from '../../services/notification.service';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';


type InvoiceDownloadFormat = 'docx';

export interface InvoicePaymentAdjustment {
  creditAmount?: number;
  refundAmount?: number;
}

export function resolveTrackedAmountPaid(status: string, total: number, amountPaid: number, adjustment: InvoicePaymentAdjustment = {}): number {
  const paid = Math.max(Number(amountPaid) || 0, 0);
  const invoiceTotal = Math.max(Number(total) || 0, 0);
  const creditAmount = Math.max(Number(adjustment.creditAmount) || 0, 0);
  const refundAmount = Math.max(Number(adjustment.refundAmount) || 0, 0);
  const allowsOverpayment = status === 'overpaid' || status === 'credited' || status === 'refunded' || creditAmount > 0 || refundAmount > 0;

  if (status === 'paid') return invoiceTotal;
  if (status === 'partial' || allowsOverpayment) {
    return allowsOverpayment ? paid : Math.min(paid, invoiceTotal);
  }
  return 0;
}

export function resolveTrackedInvoiceStatus(status: string, total: number, amountPaid: number, dueDate?: string, adjustment: InvoicePaymentAdjustment = {}, now: Date = new Date()): string {
  const invoiceTotal = Math.max(Number(total) || 0, 0);
  const paid = Math.max(Number(amountPaid) || 0, 0);
  const creditAmount = Math.max(Number(adjustment.creditAmount) || 0, 0);
  const refundAmount = Math.max(Number(adjustment.refundAmount) || 0, 0);

  if (status === 'draft') return 'draft';
  if (refundAmount > 0 || status === 'refunded') return 'refunded';
  if (creditAmount > 0 || status === 'credited') return 'credited';
  if (paid > invoiceTotal && invoiceTotal > 0) return 'overpaid';
  if (paid >= invoiceTotal && invoiceTotal > 0) return 'paid';

  if (dueDate) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (new Date(dueDate) < today) return 'overdue';
  }

  if (paid > 0) return 'partial';
  return status || 'sent';
}


@Component({
  selector: 'app-add-invoice-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, DialogShellComponent],
  templateUrl: './add-invoice-dialog.component.html',
  styleUrl: './add-invoice-dialog.component.scss'
})
export class AddInvoiceDialogComponent {
  private fb = inject(FormBuilder);
  private dialog = inject(DialogRef<string | null>);
  private data = inject(DIALOG_DATA);
  private invoiceDocx = inject(InvoiceDocxService);
  private clientSvc = inject(ClientService);
  private auth = inject(Auth);
  private db = inject(Firestore);
  private currencyService = inject(CurrencyService);
  private notifications = inject(NotificationService);

  saving = signal(false);
  error = signal<string | null>(null);
  currency = signal(this.currencyService.defaultCurrency);
  currencySymbol = signal(this.currencyService.symbolFor(this.currency()));


  client: any;
  clientId: any;
  companyId: string;
  lastInvoice: string;
  previousInvoice: any;
  viewOnly = false;
  trackingOnly = false;
  form: any;
  private syncingAmountPaid = false;

  constructor() {
    this.client = this.data?.client;
    this.clientId = this.data?.clientId;
    this.companyId = typeof this.data?.companyId === 'function' ? this.data?.companyId() : this.data?.companyId;
    this.lastInvoice = this.data?.lastInvoice;
    this.previousInvoice = this.data?.previousInvoice;
    this.viewOnly = Boolean(this.data?.viewOnly);
    this.trackingOnly = Boolean(this.data?.trackingOnly);
    const nextInvoiceNumber = this.viewOnly && this.previousInvoice?.invoiceNumber
      ? this.previousInvoice.invoiceNumber
      : this.getNextInvoiceNumber(this.lastInvoice);
    const copiedItems = this.getCopiedItems();
    this.form = this.fb.group({
      invoiceNumber: [nextInvoiceNumber, Validators.required],
      notes: [this.previousInvoice?.notes || ''],
      servicesProvided: [this.getCopiedServicesProvided(), Validators.required],
      includeVat: [this.getCopiedIncludeVat()],
      downloadFormat: ['docx' as InvoiceDownloadFormat, Validators.required],
      dueDate: [this.getCopiedDueDate()],
      amountPaid: [this.getInitialAmountPaid(), [Validators.required, Validators.min(0)]],
      creditAmount: [this.getInitialCreditAmount(), [Validators.min(0)]],
      refundAmount: [this.getInitialRefundAmount(), [Validators.min(0)]],
      status: [this.getInitialStatus(), Validators.required],
      items: this.fb.array(copiedItems.length ? copiedItems.map(item => this.createItem(item)) : [this.createItem()])
    });
    this.form.get('status')?.valueChanges.subscribe(() => this.syncAmountPaidWithStatus());
    this.form.get('items')?.valueChanges.subscribe(() => this.syncAmountPaidWithStatus());
    this.form.get('includeVat')?.valueChanges.subscribe(() => this.syncAmountPaidWithStatus());
    this.syncAmountPaidWithStatus();

    if (this.companyId) {
      docData(doc(this.db, `companies/${this.companyId}`)).pipe(take(1)).subscribe((company: any) => {
        const currency = this.currencyService.normalize(company?.currency);
        this.currency.set(currency);
        this.currencySymbol.set(this.currencyService.symbolFor(currency));
      });
    }

    if (this.viewOnly || this.trackingOnly) {
      this.form.disable({ emitEvent: false });

      if (this.trackingOnly) {
        this.form.get('dueDate')?.enable({ emitEvent: false });
        this.form.get('amountPaid')?.enable({ emitEvent: false });
        this.form.get('creditAmount')?.enable({ emitEvent: false });
        this.form.get('refundAmount')?.enable({ emitEvent: false });
        this.form.get('status')?.enable({ emitEvent: false });
      }
    }
  }

  get items() { return this.form.get('items') as FormArray; }

  get dialogTitle(): string {
    if (this.trackingOnly) return 'Update Invoice Payment';
    return this.viewOnly ? 'View Invoice' : 'Add Invoice';
  }

  get helperText(): string {
    if (this.trackingOnly) {
      return 'Update this invoice payment status, amount paid, or due date without changing invoice line details.';
    }

    return this.viewOnly
      ? 'This invoice is read-only. You can regenerate it as a Word document.'
      : 'Copied from the previous invoice. Edit any details before generating.';
  }

  createItem(item?: { description?: string; rate?: number | string; hours?: number | string }) {
    const rate = Number(item?.rate ?? 0);
    const hours = Number(item?.hours ?? 1);
    const group = this.fb.group({
      description: [item?.description || '', Validators.required],
      rate: [rate, [Validators.required, Validators.min(0)]],
      hours: [hours, [Validators.required, Validators.min(0.1)]],
      total: [{ value: rate * hours, disabled: true }]
    });

    group.valueChanges.subscribe(value => {
      const total = (parseFloat(String(value['rate'])) || 0) * (parseFloat(String(value['hours'])) || 0);
      group.get('total')?.setValue(total, { emitEvent: false });
    });

    return group;
  }

  addItem() {
    if (this.viewOnly || this.trackingOnly) return;
    this.items.push(this.createItem());
  }

  removeItem(i: number) {
    if (this.viewOnly || this.trackingOnly) return;
    if (this.items.length > 1) {
      this.items.removeAt(i);
    }
  }

  close() {
    this.dialog.close(null);
  }

  generateInvoice() {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    const formValue = this.form.getRawValue();
    const items = formValue.items.map((it: { description: string; rate: number; hours: number }) => {
      const rate = Number(it.rate) || 0;
      const hours = Number(it.hours) || 0;
      const amount = +(rate * hours).toFixed(2);

      return {
        description: it.description,
        rate,
        hours,
        amount,
        total: amount
      };
    });

    const includeVat = Boolean(formValue.includeVat);
    const servicesProvided = formValue.servicesProvided || '';
    const subtotal = +items.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0).toFixed(2);
    const vatAmount = includeVat ? +(subtotal * 0.15).toFixed(2) : 0;
    const total = +(subtotal + vatAmount).toFixed(2);
    const amountPaid = this.viewOnly ? this.resolveAmountPaid(formValue.status, total, formValue.amountPaid) : 0;
    const status = this.viewOnly ? this.resolveInvoiceStatus(formValue.status, total, amountPaid, formValue.dueDate) : 'sent';

    const invoiceData = {
      invoice_number: formValue.invoiceNumber,
      invoice_date: this.viewOnly && this.previousInvoice?.date
        ? this.toIsoDate(this.previousInvoice.date)
        : new Date().toISOString().slice(0, 10),
      client_name: this.client?.displayName || 'Unknown Client',
      client_building: this.client?.address?.building || '',
      client_street: `${this.client?.address?.line1 || ''} ${this.client?.address?.line2 || ''}`.trim(),
      client_suburb: this.client?.address?.suburb || '',
      client_city: this.client?.address?.city || '',
      client_province: this.client?.address?.province || '',
      client_postal_code: this.client?.address?.postalCode || '',
      client_contact_no: this.client?.phone || '',
      client_email: this.client?.email || '',
      services_rendered: servicesProvided,
      notes: formValue.notes || '',
      reference: formValue.invoiceNumber,
      items,
      includeVat,
      shouldIncludeVAT: includeVat
    };

    const generate$ = this.invoiceDocx.generateAndSave(this.companyId, invoiceData);

    generate$.pipe(
      switchMap(filename => {
        if (this.viewOnly) {
          return of(filename);
        }

        return from(
          this.clientSvc.createInvoice(this.clientId, {
            invoiceNumber: formValue.invoiceNumber,
            date: invoiceData.invoice_date,
            subtotal,
            excludingVat: subtotal,
            vatAmount,
            total,
            amountPaid,
            status,
            dueDate: formValue.dueDate || null,
            paidAt: status === 'paid' ? serverTimestamp() : null,
            updatedAt: serverTimestamp(),
            notes: formValue.notes || '',
            servicesProvided,
            services_rendered: servicesProvided,
            servicesRendered: servicesProvided,
            includeVat,
            shouldIncludeVAT: includeVat,
            vatIncluded: includeVat,
            vatRate: 0.15,
            items,
            lineItems: items,
            filename,
            downloadFormat: formValue.downloadFormat,
            createdAt: serverTimestamp(),
            createdBy: this.auth.currentUser?.uid
          })
        ).pipe(map(() => filename));
      }),
      tap(filename => {
        this.notifications.success(`Invoice created: ${filename}`);
        this.dialog.close(filename);
      }),
      catchError((err) => {
        const message = 'Failed to generate or save invoice.';
        this.error.set(message);
        this.notifications.error(message, err);
        return of(null);
      }),
      finalize(() => this.saving.set(false))
    ).subscribe();
  }

  private toIsoDate(value: any): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }

    if (typeof value?.toDate === 'function') {
      return value.toDate().toISOString().slice(0, 10);
    }

    return new Date(value).toISOString().slice(0, 10);
  }

  private getCopiedServicesProvided(): string {
    return this.previousInvoice?.servicesProvided
      || this.previousInvoice?.services_rendered
      || this.previousInvoice?.servicesRendered
      || this.previousInvoice?.services || '';
  }

  private getCopiedIncludeVat(): boolean {
    return this.previousInvoice?.includeVat
      ?? this.previousInvoice?.shouldIncludeVAT
      ?? false;
  }

  private getCopiedItems(): { description: string; rate: number; hours: number }[] {
    const previousItems = this.previousInvoice?.items
      || this.previousInvoice?.lineItems
      || this.previousInvoice?.invoiceItems
      || [];

    return Array.isArray(previousItems)
      ? previousItems.map((item: any) => {
        const hours = Number(item.hours ?? item.quantity ?? 1) || 1;
        const rate = Number(item.rate ?? item.price ?? item.unitPrice ?? 0);
        const amount = Number(item.amount ?? item.total ?? 0);

        return {
          description: item.description || item.name || '',
          rate: rate || (amount && hours ? amount / hours : 0),
          hours
        };
      }).filter(item => item.description || item.rate > 0)
      : [];
  }


  private getCopiedDueDate(): string {
    if ((this.viewOnly || this.trackingOnly) && this.previousInvoice?.dueDate) {
      return this.toIsoDate(this.previousInvoice.dueDate);
    }

    return this.getDefaultDueDate();
  }

  private getDefaultDueDate(): string {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);
    return dueDate.toISOString().slice(0, 10);
  }

  private getInitialAmountPaid(): number {
    return this.trackingOnly ? Number(this.previousInvoice?.amountPaid ?? 0) || 0 : 0;
  }

  private getInitialCreditAmount(): number {
    return this.trackingOnly ? Number(this.previousInvoice?.creditAmount ?? 0) || 0 : 0;
  }

  private getInitialRefundAmount(): number {
    return this.trackingOnly ? Number(this.previousInvoice?.refundAmount ?? 0) || 0 : 0;
  }

  saveTracking() {
    if (!this.trackingOnly || !this.previousInvoice?.id || this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    const formValue = this.form.getRawValue();
    const total = Number(this.previousInvoice?.total) || 0;
    const adjustment = { creditAmount: formValue.creditAmount, refundAmount: formValue.refundAmount };
    const amountPaid = this.resolveAmountPaid(formValue.status, total, formValue.amountPaid, adjustment);
    const status = this.resolveInvoiceStatus(formValue.status, total, amountPaid, formValue.dueDate, adjustment);
    const overpaidAmount = Math.max(amountPaid - total, 0);
    const creditAmount = Math.max(Number(formValue.creditAmount) || 0, 0);
    const refundAmount = Math.max(Number(formValue.refundAmount) || 0, 0);
    const paymentHistory = this.buildPaymentHistory(amountPaid, creditAmount, refundAmount);

    this.clientSvc.updateInvoiceTracking(this.clientId, this.previousInvoice.id, {
      amountPaid,
      status,
      dueDate: formValue.dueDate || null,
      creditAmount,
      refundAmount,
      overpaidAmount,
      paymentHistory,
      paidAt: ['paid', 'overpaid', 'credited', 'refunded'].includes(status) ? serverTimestamp() : null,
    }).pipe(
      tap(() => {
        this.notifications.success('Invoice payment tracking updated.');
        this.dialog.close('Invoice payment tracking updated.');
      }),
      catchError((err) => {
        const message = 'Failed to update invoice payment tracking.';
        this.error.set(message);
        this.notifications.error(message, err);
        return of(undefined);
      }),
      finalize(() => this.saving.set(false))
    ).subscribe();
  }

  private getInitialStatus(): string {
    if (!this.trackingOnly) return 'sent';
    return this.previousInvoice?.status === 'overdue' ? 'sent' : this.previousInvoice?.status || 'sent';
  }

  canEditAmountPaid(): boolean {
    return ['partial', 'overpaid', 'credited', 'refunded'].includes(this.form?.get('status')?.value);
  }

  private resolveAmountPaid(status: string, total: number, amountPaid: number, adjustment: InvoicePaymentAdjustment = {}): number {
    return resolveTrackedAmountPaid(status, total, amountPaid, adjustment);
  }

  private syncAmountPaidWithStatus() {
    if (this.syncingAmountPaid || !this.form) return;

    const status = this.form.get('status')?.value;
    if (['partial', 'overpaid', 'credited', 'refunded'].includes(status)) return;

    this.syncingAmountPaid = true;
    this.form.get('amountPaid')?.setValue(
      status === 'paid' ? this.currentFormTotal() : 0,
      { emitEvent: false }
    );
    this.syncingAmountPaid = false;
  }

  private currentFormTotal(): number {
    if (this.previousInvoice?.total && (this.viewOnly || this.trackingOnly)) {
      return Number(this.previousInvoice.total) || 0;
    }

    const items = this.form?.getRawValue()?.items ?? [];
    const subtotal = +items.reduce((sum: number, item: any) => {
      const rate = Number(item.rate) || 0;
      const hours = Number(item.hours) || 0;
      return sum + (rate * hours);
    }, 0).toFixed(2);
    const vatAmount = this.form?.getRawValue()?.includeVat ? +(subtotal * 0.15).toFixed(2) : 0;
    return +(subtotal + vatAmount).toFixed(2);
  }

  private resolveInvoiceStatus(status: string, total: number, amountPaid: number, dueDate?: string, adjustment: InvoicePaymentAdjustment = {}): string {
    return resolveTrackedInvoiceStatus(status, total, amountPaid, dueDate, adjustment, this.startOfToday());
  }

  private buildPaymentHistory(amountPaid: number, creditAmount: number, refundAmount: number) {
    const createdBy = this.auth.currentUser?.uid;
    const history = [
      amountPaid > 0 ? { type: 'payment', amount: amountPaid, createdAt: serverTimestamp(), createdBy } : null,
      creditAmount > 0 ? { type: 'credit', amount: creditAmount, createdAt: serverTimestamp(), createdBy } : null,
      refundAmount > 0 ? { type: 'refund', amount: refundAmount, createdAt: serverTimestamp(), createdBy } : null,
    ];

    return history.filter(Boolean);
  }

  private startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private getNextInvoiceNumber(lastInvoice: string | null): string {
    if (!lastInvoice) return 'INV-001';

    const match = lastInvoice.match(/^(.*?)(\d+)$/);
    if (!match) return `${lastInvoice}-COPY`;

    const [, prefix, numberPart] = match;
    const nextNum = (parseInt(numberPart, 10) + 1).toString().padStart(numberPart.length, '0');

    return `${prefix}${nextNum}`;
  }
}
