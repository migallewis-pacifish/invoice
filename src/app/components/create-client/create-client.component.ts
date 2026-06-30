import { Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { Client } from '../../models/client.model';
import { map, Observable } from 'rxjs';

@Component({
  selector: 'app-create-client',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-client.component.html',
  styleUrl: './create-client.component.scss'
})
export class CreateClientComponent implements OnChanges {
  @Input() client: Client | null = null;
  @Output() clientSaved = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();
  private fb = inject(FormBuilder);
  private clientSvc = inject(ClientService);

  saving = signal(false);
  successId = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  form = this.fb.group({
  displayName: ['', [Validators.required, Validators.minLength(2)]],
  line1: [''],
  line2: [''],
  suburb: [''],
  city: [''],
  province: [''],
  postalCode: [''],
  country: [''],
  email: ['', [Validators.email]],
  phone: [''],
  vatNo: [''],
  relationshipType: [''],
  status: ['active'],
  notes: ['']
  });


  ngOnChanges(changes: SimpleChanges): void {
    if (changes['client'] && this.client) {
      this.form.patchValue({
        displayName: this.client.displayName || '',
        line1: this.client.address?.line1 || '',
        line2: this.client.address?.line2 || '',
        suburb: this.client.address?.suburb || '',
        city: this.client.address?.city || '',
        province: this.client.address?.province || '',
        postalCode: this.client.address?.postalCode || '',
        country: this.client.address?.country || '',
        email: this.client.email || '',
        phone: this.client.phone || '',
        vatNo: this.client.vatNo || '',
        relationshipType: this.client.relationshipType || this.client.clientType || '',
        status: this.client.status || 'active',
        notes: this.client.notes || '',
      });
    }
  }

  get isEditMode(): boolean {
    return Boolean(this.client?.id);
  }

  async submit() {
    this.errorMsg.set(null);
    this.successId.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const address = {
        line1: this.form.value.line1?.trim(),
        line2: this.form.value.line2?.trim(),
        suburb: this.form.value.suburb?.trim(),
        city: this.form.value.city?.trim(),
        province: this.form.value.province?.trim(),
        postalCode: this.form.value.postalCode?.trim(),
        country: this.form.value.country?.trim()
      };

      const payload = {
        displayName: this.form.value.displayName!.trim(),
        address: address,
        email: this.form.value.email?.trim(),
        phone: this.form.value.phone?.trim(),
        vatNo: this.form.value.vatNo?.trim(),
        relationshipType: this.form.value.relationshipType?.trim(),
        status: this.form.value.status?.trim() || 'active',
        notes: this.form.value.notes?.trim(),
      };

      const save$: Observable<string> = this.isEditMode
        ? this.clientSvc.updateClient(this.client!.id, payload).pipe(map(() => this.client!.id))
        : this.clientSvc.createClient(payload);

      save$.subscribe({
        next: (id: string) => {
          const savedId = this.client?.id || id;
          this.successId.set(savedId);
          if (!this.isEditMode) this.form.reset();
          this.clientSaved.emit(savedId);
        },
        error: (err: any) => {
          this.errorMsg.set(err?.message ?? `Failed to ${this.isEditMode ? 'update' : 'create'} client`);
        }
      });
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? `Failed to ${this.isEditMode ? 'update' : 'create'} client`);
    } finally {
      this.saving.set(false);
    }
  }
  close() { this.cancel.emit(); }
}
