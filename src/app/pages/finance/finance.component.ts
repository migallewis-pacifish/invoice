import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { combineLatest, forkJoin, of, switchMap, take } from 'rxjs';
import { ExpensesComponent } from '../../components/expenses/expenses.component';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { Expense } from '../../models/expense.model';
import { InvoiceRecord } from '../../models/invoice.model';
import { ClientService } from '../../services/client.service';
import { CurrencyService } from '../../services/currency.service';
import { ExpensesService } from '../../services/expenses.service';
import { CompanyContextService } from '../../services/company-context.service';
import { buildAccountantCsv, calculateMonthlyProfit, calculateVatReport } from '../../utils/finance-calculations';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [CommonModule, FormsModule, NavBarComponent, ExpensesComponent],
  templateUrl: './finance.component.html',
  styleUrl: './finance.component.scss'
})
export class FinanceComponent {
  private readonly router = inject(Router);
  private readonly clientsService = inject(ClientService);
  private readonly expensesService = inject(ExpensesService);
  private readonly currencyService = inject(CurrencyService);
  private readonly companyContext = inject(CompanyContextService);

  companyId = signal('');
  selectedMonth = signal(this.toMonthKey(new Date()));
  currency = signal(this.currencyService.defaultCurrency);
  invoices = signal<InvoiceRecord[]>([]);
  expenses = signal<Expense[]>([]);
  loading = signal(true);

  profitSummary = computed(() => calculateMonthlyProfit(this.invoices(), this.expenses(), this.selectedMonth()));
  vatReport = computed(() => calculateVatReport(this.invoices(), this.expenses(), this.selectedMonth()));

  constructor() {
    this.companyContext.currentContext$().subscribe({
      next: ctx => {
        this.companyId.set(ctx.companyId);
        this.companyContext.currentCompany$().subscribe((company: any) => {
          this.currency.set(this.currencyService.normalize(company?.currency));
        });
        this.loadMonth(this.selectedMonth());
      },
      error: err => {
        this.router.navigate([err?.message === 'Not authenticated' ? '/login' : '/register']);
      }
    });
  }

  onMonthChange(month: string) {
    this.selectedMonth.set(month);
    this.loadMonth(month);
  }

  exportCsv() {
    const csv = buildAccountantCsv(this.selectedMonth(), this.invoices(), this.expenses());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `accountant-handoff-${this.selectedMonth()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  format(value: number) {
    return this.currencyService.format(value, this.currency());
  }

  private loadMonth(month: string) {
    const companyId = this.companyId();
    if (!companyId) return;
    this.loading.set(true);
    combineLatest([
      this.expensesService.listByMonth(companyId, month),
      this.clientsService.clients$().pipe(
        switchMap(clients => clients.length
          ? forkJoin(clients.map(client => this.clientsService.getInvoicesForClient(client.id).pipe(take(1))))
          : of([])
        )
      )
    ]).pipe(take(1)).subscribe(([expenses, invoiceGroups]) => {
      this.expenses.set(expenses);
      this.invoices.set((invoiceGroups as InvoiceRecord[][]).flat());
      this.loading.set(false);
    });
  }

  private toMonthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
