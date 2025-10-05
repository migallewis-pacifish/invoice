import { Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RegisterService } from '../../services/register.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { matchPasswords } from '../../utils/validators';

@Component({
  selector: 'app-register-wizard',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './register-wizard.component.html',
  styleUrl: './register-wizard.component.scss'
})
export class RegisterWizardComponent {
  private fb = inject(FormBuilder);
  private reg = inject(RegisterService);
  private router = inject(Router);

  step: WritableSignal<number> = signal(1);
  loading = signal(false);
  error = signal<string | null>(null);

  // Step forms
  step1 = this.fb.group({
    companyName: ['', [Validators.required, Validators.minLength(2)]],
    tel: ['', [Validators.required]],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', [Validators.required]],
  }, { validators: [matchPasswords('ownerPassword', 'confirm')] });

  step2 = this.fb.group({
    regNo: [''],
    vatNo: [''],
  });

  step3 = this.fb.group({
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    province: [''],
    postalCode: [''],
    country: ['South Africa', Validators.required],
  });

  step4 = this.fb.group({
    accountName: [''],
    accountNumber: [''],
    branchCode: [''],
  });

  step5 = this.fb.group({
    extraUserEmail: ['', [Validators.email]], // optional (max 1)
  });

  maxStep = 5;
  canNext = computed(() => {
    const s = this.step();
    if (s === 1) return this.step1.valid;
    if (s === 3) return this.step3.valid;
    return true; // 2,4,5 have optional fields
  });

  next() {
    if (!this.canNext()) { this.markCurrentTouched(); return; }
    if (this.step() < this.maxStep) this.step.update(v => v + 1);
  }
  back() { if (this.step() > 1) this.step.update(v => v - 1); }

  async submit() {
    this.error.set(null);
    if (!this.canNext()) { this.markCurrentTouched(); return; }
    this.loading.set(true);
    try {
      await this.reg.registerCompanyAndOwner({
        companyName: this.step1.value.companyName!.trim(),
        tel: this.step1.value.tel!.trim(),
        ownerEmail: this.step1.value.ownerEmail!.trim(),
        ownerPassword: this.step1.value.ownerPassword!,

        regNo: this.step2.value.regNo?.trim(),
        vatNo: this.step2.value.vatNo?.trim(),

        address: {
          line1: this.step3.value.line1!.trim(),
          line2: this.step3.value.line2?.trim(),
          city: this.step3.value.city!.trim(),
          province: this.step3.value.province?.trim(),
          postalCode: this.step3.value.postalCode?.trim(),
          country: this.step3.value.country!.trim(),
        },

        banking: (this.step4.value.accountName || this.step4.value.accountNumber || this.step4.value.branchCode) ? {
          accountName: this.step4.value.accountName?.trim() || '',
          accountNumber: this.step4.value.accountNumber?.trim() || '',
          branchCode: this.step4.value.branchCode?.trim() || '',
        } : undefined,

        extraUserEmail: this.step5.value.extraUserEmail?.trim() || undefined,
      });

      this.router.navigateByUrl('/'); // landing/dashboard
    } catch (e: any) {
      this.error.set(e?.message ?? 'Registration failed');
    } finally {
      this.loading.set(false);
    }
  }

  private markCurrentTouched() {
    const s = this.step();
    (s === 1 ? this.step1 :
     s === 2 ? this.step2 :
     s === 3 ? this.step3 :
     s === 4 ? this.step4 : this.step5).markAllAsTouched();
  }
}
