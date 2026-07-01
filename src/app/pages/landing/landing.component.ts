import { Component, computed, inject, signal } from '@angular/core';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { Auth, authState } from '@angular/fire/auth';
import { doc, docData, Firestore, updateDoc } from '@angular/fire/firestore';
import { Router, RouterLink } from '@angular/router';
import { combineLatest, take } from 'rxjs';
import { ClientListComponent } from '../client-list/client-list.component';
import { CommonModule } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { UploadTemplateDialogueComponent } from '../../components/upload-template-dialogue/upload-template-dialogue.component';
import { LinkFolderDialogueComponent } from '../../components/link-folder-dialogue/link-folder-dialogue.component';
import { CurrencyService } from '../../services/currency.service';
import { ClientService } from '../../services/client.service';
import { ExpensesService } from '../../services/expenses.service';
import { Expense } from '../../models/expense.model';
import { ActivityRecord } from '../../models/activity.model';
import { ActivityService } from '../../services/activity.service';
import { InvoiceRecord, InvoiceStatus } from '../../models/invoice.model';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [NavBarComponent, CommonModule, ClientListComponent, RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);
  private dialog = inject(Dialog);
  private currencyService = inject(CurrencyService);
  private clientService = inject(ClientService);
  private expensesService = inject(ExpensesService);
  private activityService = inject(ActivityService);

  companyId = signal<string >("");
  companyName = signal<string | null>(null);
  templatePath = signal<string | null>(null);
  currency = signal(this.currencyService.defaultCurrency);
  currencySymbol = computed(() => this.currencyService.symbolFor(this.currency()));
  invoices = signal<InvoiceRecord[]>([]);
  expenses = signal<Expense[]>([]);
  activities = signal<ActivityRecord[]>([]);

  outstanding = computed(() => this.invoices().reduce((sum, invoice) => {
    if (this.normalizedInvoiceStatus(invoice) === 'draft') return sum;
    return sum + this.invoiceOutstanding(invoice);
  }, 0));

  revenue = computed(() => this.invoices().reduce((sum, invoice) => {
    if (this.normalizedInvoiceStatus(invoice) === 'draft') return sum;
    return sum + this.invoiceRevenue(invoice);
  }, 0));

  expenseTotal = computed(() => this.expenses().reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0));
  netProfit = computed(() => this.revenue() - this.expenseTotal());

  loading = signal(true);

  chartMonths = computed(() => {
    const months = this.lastSixMonths();
    const rows = months.map(month => {
      const incomeTotal = this.invoices()
        .filter(invoice => this.invoiceMonthKey(invoice) === month.key)
        .reduce((sum, invoice) => sum + this.invoiceRevenue(invoice), 0);
      const expenseTotal = this.expenses()
        .filter(expense => this.expenseMonthKey(expense) === month.key)
        .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

      return {
        ...month,
        incomeTotal,
        expenseTotal
      };
    });
    const maxAmount = Math.max(1, ...rows.flatMap(month => [month.incomeTotal, month.expenseTotal]));

    return rows.map(month => ({
      ...month,
      income: this.toChartHeight(month.incomeTotal, maxAmount),
      expenses: this.toChartHeight(month.expenseTotal, maxAmount)
    }));
  });

  upcomingPayments = [
    { name: 'Cloud Server Subscription', meta: 'AWS Infrastructure · Due in 2 days', amount: 1250, icon: '▣', tone: 'red' },
    { name: 'Professional Insurance Premium', meta: 'Allianz · Due in 12 days', amount: 420, icon: '▤', tone: 'green' },
  ];

  activityItems = computed(() => this.activities().map(activity => ({
    ...activity,
    title: this.activityTitle(activity),
    time: this.formatActivityDate(activity.createdAt),
    icon: this.activityIcon(activity.changeType),
    tone: this.activityTone(activity.changeType),
  })));


  constructor() {
    authState(this.auth).pipe(take(1)).subscribe(async (user) => {
      if (!user) { this.router.navigate(['/login']); return; }
      const userRef = doc(this.db, `users/${user.uid}`);
      const userSnap = await docData(userRef).pipe(take(1)).toPromise() as any;
      const companyId = userSnap?.companyId;
      if (!companyId) { this.router.navigate(['/register-company']); return; }

      this.companyId.set(companyId);
      const compRef = doc(this.db, `companies/${companyId}`);
      docData(compRef).subscribe((data: any) => {
        this.companyName.set(data?.name ?? 'Your Company');
        this.templatePath.set(data?.templatePath ?? null);
        this.currency.set(this.currencyService.normalize(data?.currency));
      });

      this.activityService.recent(companyId).subscribe(activities => {
        this.activities.set(activities);
      });

      combineLatest([
        this.clientService.getInvoicesForCompany(),
        this.expensesService.listAll(companyId)
      ]).subscribe(([invoices, expenses]) => {
        this.invoices.set(invoices);
        this.expenses.set(expenses);
        this.loading.set(false);
      });
    });
  }

  goToUpload() {
    this.router.navigate(['/template']);
  }


  openUploadTemplate() {
    const ref = this.dialog.open<string | null>(UploadTemplateDialogueComponent, {
      hasBackdrop: true,
      disableClose: true,
      backdropClass: 'dlg-backdrop',
      panelClass: 'dlg-panel',
    });

    ref.closed.subscribe(path => {
      if (path) {
        // optional: toast “Template updated ✓”
        // You already subscribe to the company doc, so UI should reflect automatically.
      }
    });
  }


  private invoiceOutstanding(invoice: InvoiceRecord): number {
    const total = Number(invoice.total) || 0;
    const amountPaid = Number(invoice.amountPaid) || 0;
    return Math.max(0, +(total - amountPaid).toFixed(2));
  }

  private invoiceRevenue(invoice: InvoiceRecord): number {
    const total = Number(invoice.total) || 0;
    const amountPaid = Number(invoice.amountPaid) || 0;
    if (amountPaid > 0) return Math.min(amountPaid, total || amountPaid);
    return invoice.status === 'paid' ? total : 0;
  }

  private normalizedInvoiceStatus(invoice: InvoiceRecord): InvoiceStatus {
    if (invoice.status === 'draft') return 'draft';
    const total = Number(invoice.total) || 0;
    const amountPaid = Number(invoice.amountPaid) || 0;
    if (total > 0 && amountPaid >= total) return 'paid';
    if (amountPaid > 0) return 'partial';
    return invoice.status || 'sent';
  }


  private invoiceMonthKey(invoice: InvoiceRecord): string | null {
    return this.monthKeyFromValue(invoice.paidAt || invoice.date || invoice.createdAt || invoice.dueDate);
  }

  private expenseMonthKey(expense: Expense): string | null {
    if (expense.month) return expense.month;
    return this.monthKeyFromValue(expense.date || expense.createdAt);
  }

  private lastSixMonths() {
    const formatter = new Intl.DateTimeFormat('en', { month: 'short' });
    const today = new Date();

    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: formatter.format(date)
      };
    });
  }

  private monthKeyFromValue(value: any): string | null {
    if (!value) return null;
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private toChartHeight(amount: number, maxAmount: number): number {
    if (amount <= 0) return 0;
    return Math.max(4, Math.round((amount / maxAmount) * 100));
  }
  private activityTitle(activity: ActivityRecord): string {
    const type = activity.changeType.charAt(0).toUpperCase() + activity.changeType.slice(1);
    return `${type} by ${activity.actorName}`;
  }

  private activityIcon(changeType: ActivityRecord['changeType']): string {
    switch (changeType) {
      case 'create': return '+';
      case 'delete': return '−';
      default: return '↻';
    }
  }

  private activityTone(changeType: ActivityRecord['changeType']): 'navy' | 'light' | 'brown' {
    switch (changeType) {
      case 'create': return 'light';
      case 'delete': return 'brown';
      default: return 'navy';
    }
  }

  private formatActivityDate(value: any): string {
    if (!value) return 'Just now';
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }


  openLinkFolderDialog() {
    const ref = this.dialog.open(LinkFolderDialogueComponent, {
      backdropClass: 'dlg-backdrop',
      panelClass: 'dlg-panel',
      disableClose: true
    });

    ref.closed.subscribe((result => {
      const typedResult = result as { provider: 'local' | null; path: string | null; } | null;
      if (typedResult) {
        const companyId = this.companyId();
        if (!companyId) return;
        const companyRef = doc(this.db, `companies/${companyId}`);
        this.activityService.track(
          companyId,
          'update',
          `companies/${companyId}`,
          'Updated company storage folder settings.',
          () => updateDoc(companyRef, {
            storageProvider: typedResult.provider ?? null,
            storagePath: typedResult.path ?? null
          })
        ).catch((error) => console.error('Failed to save storage settings', error));
      }
    }));
  }

}
