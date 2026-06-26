import { DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { CommonModule } from '@angular/common';
import { InvoiceDocxService } from '../../services/invoice-docx.service';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { catchError, finalize, from, map, of, switchMap, tap } from 'rxjs';
import { Auth } from '@angular/fire/auth';


type InvoiceDownloadFormat = 'docx' | 'pdf';

@Component({
  selector: 'app-add-invoice-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule],
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

  saving = signal(false);
  error = signal<string | null>(null);


  client: any;
  clientId: any;
  companyId: string;
  lastInvoice: string;
  previousInvoice: any;
  form: any;

  constructor() {
    this.client = this.data?.client;
    this.clientId = this.data?.clientId;
    this.companyId = typeof this.data?.companyId === 'function' ? this.data?.companyId() : this.data?.companyId;
    this.lastInvoice = this.data?.lastInvoice;
    this.previousInvoice = this.data?.previousInvoice;
    const nextInvoiceNumber = this.getNextInvoiceNumber(this.lastInvoice);
    const copiedItems = this.getCopiedItems();
    this.form = this.fb.group({
      invoiceNumber: [nextInvoiceNumber, Validators.required],
      notes: [this.previousInvoice?.notes || ''],
      servicesProvided: [this.getCopiedServicesProvided(), Validators.required],
      includeVat: [this.getCopiedIncludeVat()],
      downloadFormat: ['docx' as InvoiceDownloadFormat, Validators.required],
      items: this.fb.array(copiedItems.length ? copiedItems.map(item => this.createItem(item)) : [this.createItem()])
    });
  }

  get items() { return this.form.get('items') as FormArray; }

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
    this.items.push(this.createItem());
  }

  removeItem(i: number) {
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
    const items = formValue.items.map((it: { description: string; rate: number; hours: number }) => ({
      description: it.description,
      rate: Number(it.rate),
      hours: Number(it.hours)
    }));

    const invoiceData = {
      invoice_number: formValue.invoiceNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      client_name: this.client?.displayName || 'Unknown Client',
      client_building: this.client?.address?.building || '',
      client_street: `${this.client?.address?.line1 || ''} ${this.client?.address?.line2 || ''}`.trim(),
      client_suburb: this.client?.address?.suburb || '',
      client_city: this.client?.address?.city || '',
      client_province: this.client?.address?.province || '',
      client_postal_code: this.client?.address?.postalCode || '',
      client_contact_no: this.client?.phone || '',
      client_email: this.client?.email || '',
      services_rendered: formValue.servicesProvided,
      notes: formValue.notes || '',
      reference: formValue.invoiceNumber,
      items,
      shouldIncludeVAT: formValue.includeVat
    };

    const subtotal = items.reduce((sum: number, i: { rate: number; hours: number }) => sum + (i.rate * i.hours), 0);
    const total = formValue.includeVat ? +(subtotal * 1.15).toFixed(2) : subtotal;
    const generate$ = formValue.downloadFormat === 'pdf'
      ? from(this.invoiceDocx.generatePdf(invoiceData)).pipe(map(() => `${invoiceData.invoice_number}.pdf`))
      : this.invoiceDocx.generateAndSave(this.companyId, invoiceData);

    generate$.pipe(
      switchMap(filename =>
        from(
          this.clientSvc.createInvoice(this.clientId, {
            invoiceNumber: formValue.invoiceNumber,
            date: invoiceData.invoice_date,
            total,
            notes: formValue.notes || '',
            servicesProvided: formValue.servicesProvided,
            services_rendered: formValue.servicesProvided,
            includeVat: formValue.includeVat,
            shouldIncludeVAT: formValue.includeVat,
            items,
            filename,
            downloadFormat: formValue.downloadFormat,
            createdAt: Date.now(),
            createdBy: this.auth.currentUser?.uid
          })
        ).pipe(map(() => filename))
      ),
      tap(filename => {
        this.dialog.close(filename);
      }),
      catchError((err) => {
        console.error(err);
        this.error.set('Failed to generate or save invoice.');
        return of(null);
      }),
      finalize(() => this.saving.set(false))
    ).subscribe();
  }

  private getCopiedServicesProvided(): string {
    return this.previousInvoice?.servicesProvided
      || this.previousInvoice?.services_rendered
      || this.previousInvoice?.servicesRendered
      || '';
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

  private getNextInvoiceNumber(lastInvoice: string | null): string {
    if (!lastInvoice) return 'INV-001';

    const match = lastInvoice.match(/^(.*?)(\d+)$/);
    if (!match) return `${lastInvoice}-COPY`;

    const [, prefix, numberPart] = match;
    const nextNum = (parseInt(numberPart, 10) + 1).toString().padStart(numberPart.length, '0');

    return `${prefix}${nextNum}`;
  }
}
