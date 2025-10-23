import { DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { CommonModule } from '@angular/common';

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
  private clientSvc = inject(ClientService);

  saving = signal(false);
  error = signal<string | null>(null);

  form = this.fb.group({
    invoiceNumber: ['', Validators.required],
    notes: [''],
    items: this.fb.array([
      this.createItem()
    ])
  });

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

  async generateInvoice() {
    // if (this.form.invalid) return;
    // this.saving.set(true);
    // this.error.set(null);

    // try {
    //   const formValue = this.form.value;

    //   // Example of generating invoice file from stored company template
    //   // Replace this path with the actual templatePath stored for the company
    //   const path = `templates/default.docx`;
    //   const url = await getDownloadURL(ref(this.storage, path));

    //   const response = await fetch(url);
    //   const blob = await response.blob();
    //   const arrayBuffer = await blob.arrayBuffer();
    //   const zip = new JSZip(arrayBuffer);
    //   const doc = new Docxtemplater(zip);

    //   const totalAmount = formValue.items.reduce((sum, it) => sum + (it.total || 0), 0);
    //   const today = new Date().toLocaleDateString();

    //   doc.setData({
    //     invoice_number: formValue.invoiceNumber,
    //     date: today,
    //     notes: formValue.notes,
    //     items: formValue.items,
    //     total: totalAmount
    //   });

    //   doc.render();

    //   const output = doc.getZip().generate({ type: 'blob' });
    //   const a = document.createElement('a');
    //   a.href = URL.createObjectURL(output);
    //   a.download = `Invoice_${formValue.invoiceNumber}.docx`;
    //   a.click();

    //   this.dialog.close('downloaded');
    // } catch (e: any) {
    //   console.error(e);
    //   this.error.set('Failed to generate invoice.');
    // } finally {
    //   this.saving.set(false);
    // }
  }
}
