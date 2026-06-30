import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Auth, authState } from '@angular/fire/auth';
import { doc, docData, Firestore, updateDoc } from '@angular/fire/firestore';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { CurrencyService } from '../../services/currency.service';

@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  imports: [CommonModule, RouterLink, NavBarComponent, ReactiveFormsModule],
  template: `
    <app-nav-bar></app-nav-bar>
    <main class="placeholder-wrap">
      <nav class="crumbs"><a routerLink="/">Company</a> / {{ sectionName }}</nav>
      <section class="card" *ngIf="isSettings; else placeholder">
        <h1>Settings</h1>
        <p>Select the currency symbol used across invoices, expenses, and dashboard totals.</p>

        <form [formGroup]="form" (ngSubmit)="saveCurrency()" class="settings-form">
          <label for="currency">Currency</label>
          <select id="currency" formControlName="currency">
            <option *ngFor="let option of currencyOptions" [value]="option.code">
              {{ option.label }} ({{ option.symbol }})
            </option>
          </select>
          <button class="primary" type="submit" [disabled]="saving() || !companyId()">
            {{ saving() ? 'Saving…' : 'Save Currency' }}
          </button>
        </form>

        <p class="msg" *ngIf="message()">{{ message() }}</p>
      </section>
      <ng-template #placeholder>
        <section class="card">
          <h1>{{ sectionName }}</h1>
          <!-- TODO: Implement the full {{ sectionName }} workflow once requirements are finalized. -->
          <p>This section will manage {{ sectionName }}.</p>
        </section>
      </ng-template>
    </main>
  `,
  styles: [`
    .placeholder-wrap { max-width: 1100px; margin: 24px auto; padding: 0 20px; }
    .crumbs { margin-bottom: 16px; color: #64748b; }
    .crumbs a { color: #2563eb; text-decoration: none; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(15, 23, 42, .06); }
    h1 { margin-top: 0; }
    .settings-form { display: grid; gap: 12px; max-width: 420px; margin-top: 20px; }
    .primary { border: 0; border-radius: 999px; padding: 10px 18px; background: #092c7d; color: #fff; font-weight: 700; cursor: pointer; }
    .primary:disabled { opacity: .65; cursor: not-allowed; }
    .msg { color: #007a53; font-weight: 700; }
  `]
})
export class PlaceholderPageComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private auth = inject(Auth);
  private db = inject(Firestore);
  private currencyService = inject(CurrencyService);

  sectionName = this.route.snapshot.data['sectionName'] ?? 'this section';
  isSettings = this.sectionName === 'Settings';
  currencyOptions = this.currencyService.options;
  companyId = signal<string | null>(null);
  saving = signal(false);
  message = signal('');

  form = this.fb.nonNullable.group({
    currency: [this.currencyService.defaultCurrency]
  });

  constructor() {
    if (!this.isSettings) return;

    authState(this.auth).pipe(take(1)).subscribe(async user => {
      if (!user) return;
      const userData = await docData(doc(this.db, `users/${user.uid}`)).pipe(take(1)).toPromise() as any;
      const companyId = userData?.companyId ?? null;
      this.companyId.set(companyId);
      if (!companyId) return;

      docData(doc(this.db, `companies/${companyId}`)).pipe(take(1)).subscribe((company: any) => {
        this.form.controls.currency.setValue(this.currencyService.normalize(company?.currency));
      });
    });
  }

  async saveCurrency() {
    const companyId = this.companyId();
    if (!companyId) return;

    this.saving.set(true);
    this.message.set('');
    try {
      await updateDoc(doc(this.db, `companies/${companyId}`), {
        currency: this.currencyService.normalize(this.form.controls.currency.value)
      });
      this.message.set('Currency settings saved.');
    } finally {
      this.saving.set(false);
    }
  }
}
