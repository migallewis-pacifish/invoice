import { Component, effect, inject, Input, signal } from '@angular/core';
import { ClientInvoiceSummary, ClientService } from '../../services/client.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Client } from '../../models/client.model';
import { combineLatest, map, Observable, of, startWith, take } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { AddClientDialogueComponent } from '../../components/add-client-dialogue/add-client-dialogue.component';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { Auth, authState } from '@angular/fire/auth';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { CurrencyService } from '../../services/currency.service';

interface ClientListItem {
  client: Client;
  invoiceSummary?: ClientInvoiceSummary;
}

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NavBarComponent],
  templateUrl: './client-list.component.html',
  styleUrl: './client-list.component.scss'
})
export class ClientListComponent {
  @Input() companyId = signal<string | null>(null);
  @Input() showNav = true;
  private router = inject(Router);
  private clientSvc = inject(ClientService);
  private dialog = inject(Dialog);
  private auth = inject(Auth);
  private db = inject(Firestore);
  private currencyService = inject(CurrencyService);

  // search/filter
  search = new FormControl('', { nonNullable: true });
  clients$: Observable<Client[]>;
  currencySymbol = signal(this.currencyService.symbolFor(this.currencyService.defaultCurrency));

  filtered$: Observable<ClientListItem[]>;

  constructor() {
    this.clients$ = of([]);
    this.filtered$ = of([]);

    effect(() => {
      const inputCompanyId = this.companyId();
      if (inputCompanyId) {
        this.loadCurrency(inputCompanyId);
        return;
      }

      authState(this.auth).pipe(take(1)).subscribe(async user => {
        if (!user) return;
        const userData = await docData(doc(this.db, `users/${user.uid}`)).pipe(take(1)).toPromise() as any;
        if (userData?.companyId) this.loadCurrency(userData.companyId);
      });
    });
  }

  ngOnInit(): void {
    this.clients$ = this.clientSvc.clients$();
    this.filtered$ = combineLatest([
      this.clients$,
      this.clientSvc.getClientInvoiceSummaries().pipe(startWith(null)),
      this.search.valueChanges.pipe(startWith(''))
    ]).pipe(
      map(([clients, summaries, term]) => {
        const t = (term || '').trim().toLowerCase();
        const filtered = t ? clients.filter(c =>
          (c.displayName || '').toLowerCase().includes(t) ||
          (c.email || '').toLowerCase().includes(t) ||
          (c.phone || '').toLowerCase().includes(t)
        ) : clients;

        return filtered.map(client => ({
          client,
          invoiceSummary: summaries?.[client.id]
        }));
      })
    );
  }

  goClient(c: Client) { this.openClientDetail(c); }

  async createInvoice(c: Client) {
    await this.openClientDetail(c, { openInvoiceDialog: true });
  }

  // TODO: Sorting
  initials(name = ''): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)).toUpperCase() || 'CL';
  }

  clientDescription(client: Client): string {
    return client.notes || client.vatNo || client.address?.city || 'Enterprise Account';
  }

  isActiveClient(client: Client): boolean {
    const status = (client.status || 'active').toLowerCase();
    return !['inactive', 'archived'].includes(status);
  }

  balanceStatus(summary?: ClientInvoiceSummary): string {
    if (!summary) return 'Loading invoices...';
    if (summary.invoiceCount === 0) return 'No invoice balance';
    if (summary.isSettled) return 'Settled';
    if (summary.overdueAmount > 0) return 'Overdue';
    if (summary.nextDueDate) return `Due ${new Date(summary.nextDueDate).toLocaleDateString()}`;
    return 'Payment due';
  }

  balanceTone(summary?: ClientInvoiceSummary): 'default' | 'settled' | 'overdue' {
    if (!summary || summary.invoiceCount === 0) return 'default';
    if (summary.overdueAmount > 0) return 'overdue';
    return summary.isSettled ? 'settled' : 'default';
  }

  avatarTone(index: number): string {
    return ['#284596', '#f4ded3', '#dbeafe', '#eef4ff'][index % 4];
  }

  avatarInk(index: number): string {
    return ['#ffffff', '#c2502e', '#092c7d', '#092c7d'][index % 4];
  }


  private async openClientDetail(c: Client, state?: { openInvoiceDialog: boolean }): Promise<boolean> {
    const companyId = this.companyId() || await this.currentUserCompanyId();
    if (!companyId) {
      return this.router.navigate(['/register']);
    }

    return this.router.navigate([`/company/${companyId}/client/${c.id}`], { state });
  }

  private async currentUserCompanyId(): Promise<string | null> {
    const user = await authState(this.auth).pipe(take(1)).toPromise();
    if (!user) return null;

    const userData = await docData(doc(this.db, `users/${user.uid}`)).pipe(take(1)).toPromise() as { companyId?: string } | undefined;
    return userData?.companyId ?? null;
  }

  private loadCurrency(companyId: string) {
    docData(doc(this.db, `companies/${companyId}`)).pipe(take(1)).subscribe((company: any) => {
      this.currencySymbol.set(this.currencyService.symbolFor(company?.currency));
    });
  }

  openAddClient() {
    const ref = this.dialog.open<string | null>(AddClientDialogueComponent, {
      backdropClass: 'dlg-backdrop',
      panelClass: 'dlg-panel'
    });

    ref.closed.subscribe(result => {
      if (result) {
        // optionally show toast or refresh list
      }
    });
  }
}
