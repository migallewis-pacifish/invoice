import { DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { CommonModule } from '@angular/common';
import { InvoiceDocxService } from '../../services/invoice-docx.service';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { catchError, from, map, of, switchMap, tap } from 'rxjs';
import { Auth } from '@angular/fire/auth';


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
  form: any;

  constructor() {
    this.client = this.data?.client;
    this.clientId = this.data?.clientId;
    this.form = this.fb.group({
      invoiceNumber: ['', Validators.required],
      notes: [''],
      items: this.fb.array([
        this.createItem()
      ])
    });
  }

  get items() { return this.form.get('items') as FormArray; }

  createItem() {
    const group = this.fb.group({
      description: ['', Validators.required],
      rate: [0, [Validators.required, Validators.min(0)]],
      hours: [1, [Validators.required, Validators.min(0.1)]],
      total: [{ value: 0, disabled: true }]
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
    this.items.removeAt(i);
  }

  close() {
    this.dialog.close(null);
  }

  generateInvoice() {
    if (this.form.invalid) return;

    this.saving.set(true);
    this.error.set(null);

    const formValue = this.form.value;

    const invoiceData = {
      invoice_number: formValue.invoiceNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      client_name: this.client?.displayName || 'Unknown Client',
      client_building: this.client?.address?.street || '',
      client_street: this.client?.address?.street || '',
      client_suburb: this.client?.address?.city || '',
      client_city: this.client?.address?.province || '',
      client_post_code: this.client?.address?.postalCode || '',
      client_contact_no: this.client?.phone || '',
      client_email: this.client?.email || '',
      services_rendered: 'Legal Services',
      notes: formValue.notes || '',
      reference: formValue.invoiceNumber,
      items: formValue.items.map((it: { description: string; rate: number; hours: number }) => ({
        description: it.description,
        rate: it.rate,
        hours: it.hours
      }))
    };

    const total = invoiceData.items.reduce((sum: number, i: { description: string; rate: number; hours: number }) => sum + (i.rate * i.hours), 0);

    // 🔹 Step 1: Generate + Download invoice via your existing service (returns filename)
    from(this.invoiceDocx.generateAndDownload(invoiceData)).pipe(

      // 🔹 Step 2: Use switchMap to save invoice to Firestore
      switchMap(filename =>
        from(
          this.clientSvc.createInvoice(this.clientId, {
            invoiceNumber: formValue.invoiceNumber,
            date: invoiceData.invoice_date,
            total,
            notes: formValue.notes || '',
            filename,
            createdAt: Date.now(),
            createdBy: this.auth.currentUser?.uid
          })
        ).pipe(map(() => filename))
      ),

      // 🔹 Step 3: Optional side effects
      tap(filename => {
        this.dialog.close(filename);
      }),

      // 🔹 Step 4: Handle errors
      catchError((err) => {
        console.error(err);
        this.error.set('Failed to generate or save invoice.');
        return of(null);
      })

    ).subscribe({
      next: () => this.saving.set(false),
      error: () => this.saving.set(false),
      complete: () => this.saving.set(false)
    });
  }
}