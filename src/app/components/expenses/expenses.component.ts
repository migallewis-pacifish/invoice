import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ExpensesService } from '../../services/expenses.service';
import { ClientService } from '../../services/client.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, switchMap, take } from 'rxjs';
import { CreateExpense, Expense } from '../../models/expense.model';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { CurrencyService } from '../../services/currency.service';
import { CardHeaderComponent } from '../card-header/card-header.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CardHeaderComponent, EmptyStateComponent],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss'
})
export class ExpensesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly expensesService = inject(ExpensesService);
  private readonly clientsService = inject(ClientService);
  private readonly db = inject(Firestore);
  private readonly currencyService = inject(CurrencyService);

  // Provided by parent
  companyId = input<string>('');
  clientId = input<string | null>(null);
  showClientPicker = input(true);
  title = input('Expenses');
  subtitle = input('Capture and manage business expenses per month');

  // Month selection
  selectedMonth = signal<string>(this.toMonthKey(new Date()));
  private readonly month$ = new BehaviorSubject<string>(this.selectedMonth());
  currency = signal(this.currencyService.defaultCurrency);
  currencySymbol = computed(() => this.currencyService.symbolFor(this.currency()));

  constructor() {
    effect(() => {
      const companyId = this.companyId();
      if (!companyId) return;
      docData(doc(this.db, `companies/${companyId}`)).pipe(take(1)).subscribe((company: any) => {
        this.currency.set(this.currencyService.normalize(company?.currency));
      });
    });
  }

  // Categories used in the dropdown
  categories = [
    'Fuel / Travel',
    'Software / Subscriptions',
    'Internet / Phone',
    'Office Supplies',
    'Equipment',
    'Meals / Entertainment',
    'Rent',
    'Marketing',
    'Other',
  ];

  // Form matches the HTML
  form = this.fb.nonNullable.group({
    date: [this.todayISO(), [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(2)]],
    category: ['Other', [Validators.required]],
    supplier: [''],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    notes: [''],
    clientId: [null as string | null], // optional
  });

  // Clients dropdown (optional link)
  clients = this.clientsService.clients$();

  // Expenses list for selected month
  expenses = toSignal(
    this.month$.pipe(
      switchMap(month => {
        const clientId = this.clientId();
        return clientId
          ? this.expensesService.listByClientAndMonth(this.companyId(), clientId, month)
          : this.expensesService.listCompanyLevelByMonth(this.companyId(), month);
      })
    ),
    { initialValue: [] as Expense[] }
  );

  // Monthly total
  monthlyTotal = computed(() =>
    this.expenses().reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  );

  onMonthChange(value: string) {
    this.selectedMonth.set(value);
    this.month$.next(value);

    // keep the form date inside selected month
    const currentDate = this.form.controls.date.value;
    if (!currentDate.startsWith(value)) {
      this.form.controls.date.setValue(`${value}-01`);
    }
  }

  async addExpense() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();

    const payload: CreateExpense = {
      month: v.date.slice(0, 7), // YYYY-MM
      date: v.date,
      description: v.description.trim(),
      category: v.category,
      supplier: v.supplier?.trim() || "",
      amount: Number(v.amount),
      notes: v.notes?.trim() || "",
      clientId: this.clientId() ?? v.clientId ?? null,
    };

    await this.expensesService.add(this.companyId(), payload);

    // reset some fields
    this.form.controls.description.setValue('');
    this.form.controls.supplier.setValue('');
    this.form.controls.amount.setValue(0);
    this.form.controls.notes.setValue('');
    this.form.controls.clientId.setValue(this.clientId());
  }

  async deleteExpense(expense: Expense) {
    await this.expensesService.remove(this.companyId(), expense.id, expense.clientId, expense.source);
  }

  formatCurrency(value: number) {
    return this.currencyService.format(value, this.currency());
  }

  pad2(n: number) {
  return String(n).padStart(2, '0');
  }
  toMonthKey(d: Date) {
    return `${d.getFullYear()}-${this.pad2(d.getMonth() + 1)}`;
  }
  todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${this.pad2(d.getMonth() + 1)}-${this.pad2(d.getDate())}`;
  }
}
