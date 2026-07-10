import { Component, effect, inject, Input, signal } from '@angular/core';
import { ClientInvoiceSummary, ClientService } from '../../services/client.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Client } from '../../models/client.model';
import { combineLatest, firstValueFrom, map, Observable, of, startWith, take } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { AddClientDialogueComponent } from '../../components/add-client-dialogue/add-client-dialogue.component';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { WorkspaceTopbarComponent } from '../../components/workspace-topbar/workspace-topbar.component';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { CurrencyService } from '../../services/currency.service';
import { CompanyContextService } from '../../services/company-context.service';
import { downloadClientsCsv } from '../../utils/client-csv';

export interface ClientListItem {
  client: Client;
  invoiceSummary?: ClientInvoiceSummary;
}

type SortField = 'displayName' | 'status' | 'balance' | 'contact';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';

export interface ClientListFilters {
  searchTerm: string;
  status: string;
  relationshipType: string;
  sortField: SortField;
  sortDirection: SortDirection;
}

export function filterAndSortClients(
  clients: Client[],
  summaries: Record<string, ClientInvoiceSummary> | null,
  filters: ClientListFilters
): ClientListItem[] {
  const term = (filters.searchTerm || '').trim().toLowerCase();
  const status = (filters.status || 'all').toLowerCase();
  const relationship = (filters.relationshipType || 'all').toLowerCase();

  return clients
    .filter(client => {
      const searchHaystack = [
        client.displayName,
        client.email,
        client.phone,
        client.notes,
        client.vatNo,
        client.address?.city,
      ].join(' ').toLowerCase();
      const clientStatus = (client.status || 'active').toLowerCase();
      const relationshipValues = [client.relationshipType, client.clientType]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());

      return (!term || searchHaystack.includes(term))
        && (status === 'all' || clientStatus === status)
        && (relationship === 'all' || relationshipValues.includes(relationship));
    })
    .map(client => ({ client, invoiceSummary: summaries?.[client.id] }))
    .sort((a, b) => compareClientListItems(a, b, filters.sortField, filters.sortDirection));
}

function compareClientListItems(a: ClientListItem, b: ClientListItem, field: SortField, direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  const values: Record<SortField, [string | number, string | number]> = {
    displayName: [a.client.displayName || '', b.client.displayName || ''],
    status: [a.client.status || 'active', b.client.status || 'active'],
    balance: [a.invoiceSummary?.outstandingBalance ?? 0, b.invoiceSummary?.outstandingBalance ?? 0],
    contact: [a.client.email || a.client.phone || '', b.client.email || b.client.phone || ''],
  };
  const [left, right] = values[field];
  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
  return result * multiplier;
}

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NavBarComponent, WorkspaceTopbarComponent],
  templateUrl: './client-list.component.html',
  styleUrl: './client-list.component.scss'
})
export class ClientListComponent {
  @Input() companyId = signal<string | null>(null);
  @Input() showNav = true;
  private router = inject(Router);
  private clientSvc = inject(ClientService);
  private dialog = inject(Dialog);
  private db = inject(Firestore);
  private currencyService = inject(CurrencyService);
  private companyContext = inject(CompanyContextService);

  // search/filter
  search = new FormControl('', { nonNullable: true });
  statusFilter = new FormControl('all', { nonNullable: true });
  relationshipFilter = new FormControl('all', { nonNullable: true });
  sortField = new FormControl<SortField>('displayName', { nonNullable: true });
  sortDirection = new FormControl<SortDirection>('asc', { nonNullable: true });
  selectedClientIds = signal<Set<string>>(new Set());
  viewMode = signal<ViewMode>('table');
  private latestItems: ClientListItem[] = [];
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

      this.companyContext.currentCompanyId$().pipe(take(1)).subscribe(companyId => {
        if (companyId) this.loadCurrency(companyId);
      });
    });
  }

  ngOnInit(): void {
    this.clients$ = this.clientSvc.clients$();
    this.filtered$ = combineLatest([
      this.clients$,
      this.clientSvc.getClientInvoiceSummaries().pipe(startWith(null)),
      this.search.valueChanges.pipe(startWith(this.search.value)),
      this.statusFilter.valueChanges.pipe(startWith(this.statusFilter.value)),
      this.relationshipFilter.valueChanges.pipe(startWith(this.relationshipFilter.value)),
      this.sortField.valueChanges.pipe(startWith(this.sortField.value)),
      this.sortDirection.valueChanges.pipe(startWith(this.sortDirection.value))
    ]).pipe(
      map(([clients, summaries, searchTerm, status, relationshipType, sortField, sortDirection]) => {
        const items = filterAndSortClients(clients, summaries, { searchTerm, status, relationshipType, sortField, sortDirection });
        this.latestItems = items;
        this.selectedClientIds.update(selected => new Set([...selected].filter(id => items.some(item => item.client.id === id))));
        return items;
      })
    );
  }

  goClient(c: Client) { this.openClientDetail(c); }

  async createInvoice(c: Client) {
    await this.openClientDetail(c, { openInvoiceDialog: true });
  }

  setSort(field: SortField): void {
    if (this.sortField.value === field) {
      this.sortDirection.setValue(this.sortDirection.value === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortField.setValue(field);
    this.sortDirection.setValue(field === 'balance' ? 'desc' : 'asc');
  }

  sortLabel(field: SortField): string {
    return this.sortField.value === field ? (this.sortDirection.value === 'asc' ? '↑' : '↓') : '↕';
  }

  setViewMode(mode: ViewMode): void { this.viewMode.set(mode); }

  isSelected(client: Client): boolean { return this.selectedClientIds().has(client.id); }

  toggleClientSelection(client: Client, checked: boolean): void {
    this.selectedClientIds.update(current => {
      const next = new Set(current);
      checked ? next.add(client.id) : next.delete(client.id);
      return next;
    });
  }

  toggleAllVisible(items: ClientListItem[], checked: boolean): void {
    this.selectedClientIds.update(current => {
      const next = new Set(current);
      items.forEach(item => checked ? next.add(item.client.id) : next.delete(item.client.id));
      return next;
    });
  }

  allVisibleSelected(items: ClientListItem[]): boolean {
    return items.length > 0 && items.every(item => this.selectedClientIds().has(item.client.id));
  }

  selectedItems(): ClientListItem[] {
    const selected = this.selectedClientIds();
    return this.latestItems.filter(item => selected.has(item.client.id));
  }

  bulkArchive(): void { this.bulkUpdateStatus('archived'); }

  bulkMarkInactive(): void { this.bulkUpdateStatus('inactive'); }

  exportVisibleClients(): void { downloadClientsCsv(this.latestItems, 'clients.csv'); }

  exportSelectedClients(): void { downloadClientsCsv(this.selectedItems(), 'selected-clients.csv'); }

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


  private bulkUpdateStatus(status: 'inactive' | 'archived'): void {
    this.selectedItems().forEach(item => this.clientSvc.updateClient(item.client.id, { status }).subscribe());
    this.selectedClientIds.set(new Set());
  }

  private async openClientDetail(c: Client, state?: { openInvoiceDialog: boolean }): Promise<boolean> {
    const companyId = this.companyId() || await this.currentUserCompanyId();
    if (!companyId) {
      return this.router.navigate(['/register']);
    }

    return this.router.navigate([`/company/${companyId}/client/${c.id}`], { state });
  }

  private async currentUserCompanyId(): Promise<string | null> {
    return firstValueFrom(this.companyContext.currentCompanyId$().pipe(take(1)));
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
