import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';

@Component({
  selector: 'app-create-client',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-client.component.html',
  styleUrl: './create-client.component.scss'
})
export class CreateClientComponent {
  private fb = inject(FormBuilder);
  private clientSvc = inject(ClientService);

  saving = signal(false);
  successId = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  form = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    address: [''],
    email: ['', [Validators.email]],
    phone: [''],
    vatNo: [''],
    notes: [''],
  });

  async submit() {
    this.errorMsg.set(null);
    this.successId.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const id = await this.clientSvc.createClient({
        displayName: this.form.value.displayName!.trim(),
        address: this.form.value.address?.trim(),
        email: this.form.value.email?.trim(),
        phone: this.form.value.phone?.trim(),
        vatNo: this.form.value.vatNo?.trim(),
        notes: this.form.value.notes?.trim(),
      });
      this.successId.set(id);
      this.form.reset();
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to create client');
    } finally {
      this.saving.set(false);
    }
  }
}
