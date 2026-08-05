import { Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { Client, ClientType } from '../../models/client.model';
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
  clientType: ['client', [Validators.required]],
  title: [''],
  firstName: ['', [Validators.minLength(2)]],
  lastName: ['', [Validators.minLength(2)]],
  companyName: ['', [Validators.minLength(2)]],
  building: [''],
  line1: [''],
  line2: [''],
  suburb: [''],
  city: [''],
  province: [''],
  postalCode: [''],
  country: [''],
  email: ['', [Validators.email]],
  phone: ['', [Validators.required]],
  vatNo: [''],
  relationshipType: [''],
  status: ['active', [Validators.required]],
  notes: ['']
  });

  readonly clientTypes: { value: ClientType; label: string }[] = [
    { value: 'client', label: 'Client' },
    { value: 'tenant', label: 'Tenant' },
    { value: 'company', label: 'Company' },
    { value: 'employee', label: 'Employee' }
  ];

  constructor() {
    this.form.controls.clientType.valueChanges.subscribe(() => this.updateNameValidators());
    this.updateNameValidators();
  }


  ngOnChanges(changes: SimpleChanges): void {
    if (changes['client'] && this.client) {
      const clientType = this.normalizedClientType(
        this.client.clientType,
        this.client.title || this.client.firstName || this.client.lastName ? 'client' : 'company'
      );
      this.form.patchValue({
        clientType,
        title: this.client.title || '',
        firstName: this.client.firstName || (clientType !== 'company' ? this.client.displayName : ''),
        lastName: this.client.lastName || '',
        companyName: this.client.companyName || (clientType === 'company' ? this.client.displayName : ''),
        building: this.client.address?.building || '',
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
        relationshipType: this.client.relationshipType || '',
        status: this.client.status || 'active',
        notes: this.client.notes || '',
      });
      this.updateNameValidators();
    }
  }

  get isEditMode(): boolean {
    return Boolean(this.client?.id);
  }

  get isCompany(): boolean {
    return this.form.controls.clientType.value === 'company';
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
        building: this.form.value.building?.trim(),
        line1: this.form.value.line1?.trim(),
        line2: this.form.value.line2?.trim(),
        suburb: this.form.value.suburb?.trim(),
        city: this.form.value.city?.trim(),
        province: this.form.value.province?.trim(),
        postalCode: this.form.value.postalCode?.trim(),
        country: this.form.value.country?.trim()
      };

      const payload = {
        clientType: this.form.value.clientType as ClientType,
        title: this.form.value.title?.trim(),
        firstName: this.isCompany ? '' : this.form.value.firstName?.trim(),
        lastName: this.isCompany ? '' : this.form.value.lastName?.trim(),
        companyName: this.isCompany ? this.form.value.companyName?.trim() : '',
        displayName: this.displayName(),
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
          if (!this.isEditMode) this.form.reset({ clientType: 'client', status: 'active' });
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
  private displayName(): string {
    if (this.isCompany) return this.form.value.companyName?.trim() || '';
    return [this.form.value.title, this.form.value.firstName, this.form.value.lastName].map(value => value?.trim()).filter(Boolean).join(' ');
  }

  private normalizedClientType(value?: string, fallback: ClientType = 'company'): ClientType {
    return ['client', 'tenant', 'company', 'employee'].includes(value || '') ? value as ClientType : fallback;
  }

  private updateNameValidators(): void {
    const requiredName = [Validators.required, Validators.minLength(2)];
    this.form.controls.companyName.setValidators(this.isCompany ? requiredName : [Validators.minLength(2)]);
    this.form.controls.firstName.setValidators(this.isCompany ? [Validators.minLength(2)] : requiredName);
    this.form.controls.lastName.setValidators(this.isCompany ? [Validators.minLength(2)] : requiredName);
    this.form.controls.companyName.updateValueAndValidity({ emitEvent: false });
    this.form.controls.firstName.updateValueAndValidity({ emitEvent: false });
    this.form.controls.lastName.updateValueAndValidity({ emitEvent: false });
  }
  close() { this.cancel.emit(); }
}
