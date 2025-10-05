import { Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RegisterService } from '../../services/register.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { matchPasswords } from '../../utils/validators';
import { map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

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

  step1 = this.fb.group({
    companyName: ['', [Validators.required, Validators.minLength(2)]],
    tel: ['', [Validators.required]],
    regNo: ['', Validators.required],
    vatNo: ['']
  });

  step2 = this.fb.group({
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    province: [''],
    postalCode: [''],
    country: ['South Africa', Validators.required],
  });
  step3 = this.fb.group({
    bankName: ['', Validators.required],
    accountName: ['', Validators.required],
    accountNumber: ['', Validators.required],
    branchCode: ['', Validators.required],
  });
  step4 = this.fb.group({
    extraUserEmail: ['', [Validators.email]],
  });

  maxStep = 4;

  private asValidSignal = (ctrl: any) =>
    toSignal(
      ctrl.statusChanges.pipe(
        startWith(ctrl.status),                 // fire initially
        map((s: string) => s === 'VALID')
      ),
      { initialValue: ctrl.valid }              // in case statusChanges hasn't fired yet
    );

  step1Valid = this.asValidSignal(this.step1);
  step2Valid = this.asValidSignal(this.step2);
  step3Valid = this.asValidSignal(this.step3);
  step4Valid = this.asValidSignal(this.step4);

  // recompute canNext based on *signals*
  canNext = computed(() => {
    switch (this.step()) {
      case 1: return this.step1Valid();
      case 2: return this.step2Valid();          // optional step
      case 3: return this.step3Valid();
      case 4: return this.step4Valid();
      default: return false;
    }
  });

  next() {
    if (!this.canNext()) { this.markCurrentTouched(); return; }
    if (this.step() < this.maxStep) this.step.update(v => v + 1);
  }
  back() { if (this.step() > 1) this.step.update(v => v - 1); }

  async submit() {
    if (!this.canNext()) { this.markCurrentTouched(); return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.reg.createCompanyForCurrentUser({
        companyName: this.step1.value.companyName!.trim(),
        tel: this.step1.value.tel!.trim(),
        regNo: this.step1.value.regNo?.trim(),
        vatNo: this.step1.value.vatNo?.trim(),
        address: {
          line1: this.step2.value.line1!.trim(),
          line2: this.step2.value.line2?.trim(),
          city: this.step2.value.city!.trim(),
          province: this.step2.value.province?.trim(),
          postalCode: this.step2.value.postalCode?.trim(),
          country: this.step2.value.country!.trim(),
        },
        banking: (this.step3.value.bankName || this.step3.value.accountName || this.step3.value.accountNumber || this.step3.value.branchCode) ? {
          bankName: this.step3.value.bankName?.trim() || '',
          accountName: this.step3.value.accountName?.trim() || '',
          accountNumber: this.step3.value.accountNumber?.trim() || '',
          branchCode: this.step3.value.branchCode?.trim() || '',
        } : undefined,
        extraUserEmail: this.step4.value.extraUserEmail?.trim() || undefined,
      });
      this.router.navigateByUrl('/');
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
        s === 3 ? this.step3 : this.step4).markAllAsTouched();
  }
}
