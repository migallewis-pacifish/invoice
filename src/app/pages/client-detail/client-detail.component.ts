import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClientService } from '../../services/client.service';
import { take } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { AddInvoiceDialogComponent } from '../../components/add-invoice-dialog/add-invoice-dialog.component';
import { AddLetterDialogComponent } from '../../components/add-letter-dialog/add-letter-dialog.component';
import { OrderByDateDescPipe } from './order-by-date-desc.pipe';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { WorkspaceTopbarComponent } from '../../components/workspace-topbar/workspace-topbar.component';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { CurrencyService } from '../../services/currency.service';
import { InvoiceRecord, InvoiceStatus } from '../../models/invoice.model';
import { CreateExpense, Expense } from '../../models/expense.model';
import { ExpensesService } from '../../services/expenses.service';
import { ExpensesComponent } from '../../components/expenses/expenses.component';
import { Client } from '../../models/client.model';
import { CompanyDocumentStorageSettings, DOCUMENT_STORAGE_PROVIDER_LABELS, DocumentStorageProvider } from '../../models/document-storage.model';
import { DocumentStorageService } from '../../services/document-storage.service';
import { NotificationService } from '../../services/notification.service';
import { CreateClientComponent } from '../../components/create-client/create-client.component';
import { EmailComposeDialogComponent } from '../../components/email-compose-dialog/email-compose-dialog.component';
import { EmailService, EmailDocumentType, InvoiceReminderType } from '../../services/email.service';
import { InvoiceTableComponent } from '../../components/invoice-table/invoice-table.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../components/loading-state/loading-state.component';
import { WorkspaceShellComponent } from '../../components/workspace-shell/workspace-shell.component';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, NavBarComponent, WorkspaceTopbarComponent, OrderByDateDescPipe, CreateClientComponent, ExpensesComponent, InvoiceTableComponent, StatusBadgeComponent, EmptyStateComponent, LoadingStateComponent, WorkspaceShellComponent],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss'
})
export class ClientDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientSvc = inject(ClientService);
  private dialog = inject(Dialog);
  private db = inject(Firestore);
  private currencyService = inject(CurrencyService);
  private documentStorageService = inject(DocumentStorageService);
  private expensesService = inject(ExpensesService);
  private notifications = inject(NotificationService);
  private emailService = inject(EmailService);
  private fb = inject(FormBuilder);
  
  companyId = signal<string | null>(null);
  clientId = signal<string | null>(null);
  client = signal<Client | null>(null);
  invoices = signal<InvoiceRecord[]>([]);
  letters = signal<any[]>([]);
  expenses = signal<Expense[]>([]);
  lastInvoice = signal<any | null>(null);
  loading = signal(true);
  currency = signal(this.currencyService.defaultCurrency);
  currencySymbol = computed(() => this.currencyService.symbolFor(this.currency()));
  activeTab = signal<ClientTab>('overview');
  companyStorage = signal<CompanyDocumentStorageSettings | null>(null);
  savingClientStorage = signal(false);
  clientStorageMessage = signal('');
  clientStorageProvider = signal<DocumentStorageProvider | 'company_default'>('company_default');
  clientStorageLocation = signal('');
  clientStorageFolderId = signal('');
  editingClient = signal(false);
  noteDraft = signal('');
  private openedInvoiceFromNavigation = false;

  readonly tabs: { id: ClientTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'letters', label: 'Letters' }
  ];

  readonly documentTotal = 14;

  readonly expenseCategories = [
    'Fuel / Travel',
    'Software / Subscriptions',
    'Internet / Phone',
    'Office Supplies',
    'Equipment',
    'Meals / Entertainment',
    'Rent',
    'Marketing',
    'Other'
  ];

  expenseForm = this.fb.nonNullable.group({
    date: [this.todayISO(), [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(2)]],
    category: ['Other', [Validators.required]],
    supplier: [''],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    notes: ['']
  });

  clientExpenseTotal = computed(() =>
    this.expenses().reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0)
  );

  constructor() {
    this.route.paramMap.subscribe(params => {
      const companyId = params.get('companyId');
      const clientId = params.get('clientId');
      if (!clientId || !companyId) {
        this.router.navigate(['/']);
        return;
      }
      this.clientId.set(clientId);
      this.companyId.set(companyId);

      docData(doc(this.db, `companies/${companyId}`)).pipe(take(1)).subscribe((company: any) => {
        this.currency.set(this.currencyService.normalize(company?.currency));
      });

      this.documentStorageService.getCompanySettings(companyId).pipe(take(1)).subscribe(settings => {
        this.companyStorage.set(settings);
      });

      // Subscribe to client data
      this.clientSvc.getClientById(clientId).pipe(take(1)).subscribe(data => {
        this.client.set(data);
        this.noteDraft.set(data?.notes || '');
        this.syncClientStorageDraft(data);
        this.loading.set(false);
        this.openInvoiceDialogFromNavigation();
      });

      // Real-time invoices
      this.clientSvc.getInvoicesForClient(clientId).subscribe(list => {
        this.invoices.set(list);
        this.lastInvoice.set(list.length > 0 ? list[0] : null);
      });

      this.clientSvc.getLettersForClient(clientId).subscribe(list => {
        this.letters.set(list);
      });

      this.expensesService.listByClient(companyId, clientId).subscribe(list => {
        this.expenses.set(list);
      });
    });
  }

  get initials(): string {
    const name = this.client()?.displayName || 'Client';
    return name.split(' ').slice(0, 2).map((part: string) => part[0]).join('').toUpperCase();
  }

  get formattedAddress(): string {
    const address = this.client()?.address;
    if (!address) return 'Address not provided';
    return [address.line1, address.line2, address.suburb, address.city, address.province, address.postalCode, address.country]
      .filter(Boolean)
      .join(', ');
  }

  get primaryContact(): string {
    return this.client()?.displayName || this.client()?.phone || 'Not provided';
  }

  startEditClient(): void {
    this.editingClient.set(true);
    this.activeTab.set('details');
  }

  get clientEmail(): string {
    return this.client()?.email || 'Not provided';
  }

  get relationshipType(): string {
    return this.client()?.relationshipType || this.client()?.clientType || 'Not provided';
  }

  get clientStatus(): string {
    return this.client()?.status || 'Not provided';
  }

  get clientStatusClass(): string {
    const normalized = this.clientStatus.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    return normalized === 'not-provided' ? 'status-draft' : `status-${normalized}`;
  }


  invoiceTotal = computed(() => this.invoices().length);

  overdueInvoiceTotal = computed(() =>
    this.invoices().filter(invoice => this.normalizedInvoiceStatus(invoice) === 'overdue').length
  );

  sentLetterTotal = computed(() => this.letters().length);

  outstandingBalance = computed(() => this.invoices().reduce((sum, invoice) => {
    if (this.normalizedInvoiceStatus(invoice) === 'draft') return sum;
    return sum + this.invoiceOutstanding(invoice);
  }, 0));

  overdueBalance = computed(() => this.invoices().reduce((sum, invoice) => {
    return this.isInvoiceOverdueForBalance(invoice)
      ? sum + this.invoiceOutstanding(invoice)
      : sum;
  }, 0));

  private isInvoiceOverdueForBalance(invoice: InvoiceRecord): boolean {
    const status = invoice.status || 'sent';
    const canBeOverdue = status === 'sent' || status === 'partial' || status === 'overdue';
    return canBeOverdue && this.invoiceOutstanding(invoice) > 0 && this.isPastDue(invoice.dueDate);
  }

  invoiceOutstanding(invoice: InvoiceRecord): number {
    const total = Number(invoice.total) || 0;
    const amountPaid = Number(invoice.amountPaid) || 0;
    return Math.max(0, +(total - amountPaid).toFixed(2));
  }

  normalizedInvoiceStatus(invoice: InvoiceRecord): InvoiceStatus {
    if (invoice.status === 'draft') return 'draft';
    const total = Number(invoice.total) || 0;
    const amountPaid = Number(invoice.amountPaid) || 0;
    if (total > 0 && amountPaid >= total) return 'paid';
    if (this.isPastDue(invoice.dueDate) && this.invoiceOutstanding(invoice) > 0) return 'overdue';
    if (amountPaid > 0) return 'partial';
    return invoice.status || 'sent';
  }

  invoiceStatusLabel(invoice: InvoiceRecord): string {
    const status = this.normalizedInvoiceStatus(invoice);
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  readonly invoiceStatusFor = (invoice: InvoiceRecord) => this.normalizedInvoiceStatus(invoice);
  readonly invoiceCanRemind = (invoice: InvoiceRecord) => this.canSendReminder(invoice);
  readonly invoiceReminderText = (invoice: InvoiceRecord) => this.reminderLabel(invoice);

  private isPastDue(value: any): boolean {
    if (!value) return false;
    const dueDate = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(dueDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  updateNote(value: string) {
    this.noteDraft.set(value);
  }

addInvoice(previousInvoice: any | null = null, viewOnly = false, trackingOnly = false) {
  const ref = this.dialog.open(AddInvoiceDialogComponent, {
    backdropClass: 'dlg-backdrop',
    panelClass: 'dlg-panel',
    disableClose: true,
    data: {
      client: this.client(),
      clientId: this.clientId(),
      companyId: this.companyId(),
      lastInvoice: this.lastInvoice()?.invoiceNumber,
      previousInvoice,
      viewOnly,
      trackingOnly
    }
  });

  ref.closed.subscribe(filename => {
    if (filename) {
      this.notifications.success(`Invoice created: ${filename}`);
    }
  });
}

viewInvoice(invoice: any) {
  this.addInvoice(invoice, true);
}


  private openInvoiceDialogFromNavigation(): void {
    if (this.openedInvoiceFromNavigation || !history.state?.openInvoiceDialog) return;

    this.openedInvoiceFromNavigation = true;
    queueMicrotask(() => this.addInvoice());
  }


updateInvoiceTracking(invoice: any) {
  this.addInvoice(invoice, false, true);
}


async addClientExpense() {
  const companyId = this.companyId();
  const clientId = this.clientId();
  if (!companyId || !clientId) return;
  if (this.expenseForm.invalid) {
    this.expenseForm.markAllAsTouched();
    return;
  }

  const value = this.expenseForm.getRawValue();
  const payload: CreateExpense = {
    month: value.date.slice(0, 7),
    date: value.date,
    description: value.description.trim(),
    category: value.category,
    supplier: value.supplier?.trim() || '',
    amount: Number(value.amount),
    notes: value.notes?.trim() || '',
    clientId
  };

  await this.expensesService.add(companyId, payload);
  this.expenseForm.patchValue({
    description: '',
    supplier: '',
    amount: 0,
    notes: ''
  });
}

async deleteClientExpense(id: string) {
  const companyId = this.companyId();
  if (!companyId) return;
  await this.expensesService.remove(companyId, id);
}

formatExpenseDate(value: any): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}

pad2(n: number) {
  return String(n).padStart(2, '0');
}

todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${this.pad2(d.getMonth() + 1)}-${this.pad2(d.getDate())}`;
}

addLetter() {
  const ref = this.dialog.open(AddLetterDialogComponent, {
    backdropClass: 'dlg-backdrop',
    panelClass: 'dlg-panel',
    disableClose: true,
    data: {
      client: this.client(),
      clientId: this.clientId(),
      companyId: this.companyId()
    }
  });

  ref.closed.subscribe(filename => {
    if (filename) {
      this.notifications.success(`Letter created: ${filename}`);
    }
  });
}

cancelEditClient() {
  this.editingClient.set(false);
}

onClientSaved() {
  const id = this.clientId();
  if (!id) return;
  this.clientSvc.getClientById(id).pipe(take(1)).subscribe(data => {
    this.client.set(data);
    this.noteDraft.set(data?.notes || '');
    this.syncClientStorageDraft(data);
    this.editingClient.set(false);
  });
}

setTab(tab: ClientTab) {
  this.activeTab.set(tab);
}

get companyDefaultProviderLabel(): string {
  return DOCUMENT_STORAGE_PROVIDER_LABELS[this.companyStorage()?.defaultProvider || 'browser_download'];
}

get effectiveStorageProviderLabel(): string {
  const clientStorage = this.client()?.documentStorage;
  const provider = clientStorage?.inheritCompanyDefault === false && clientStorage.provider
    ? clientStorage.provider
    : this.companyStorage()?.defaultProvider;
  return DOCUMENT_STORAGE_PROVIDER_LABELS[provider || 'browser_download'];
}

get effectiveStorageLocation(): string {
  const storage = this.client()?.documentStorage;
  if (storage?.inheritCompanyDefault === false) {
    return storage.folderName || storage.folderUrl || storage.localPath || storage.externalUrl || 'Client folder not configured';
  }
  const company = this.companyStorage();
  if (!company) return 'Company default loading…';
  switch (company.defaultProvider) {
    case 'google_drive': return company.googleDrive?.rootFolderName || company.googleDrive?.rootFolderUrl || 'Default Drive folder not configured';
    case 'onedrive': return company.oneDrive?.rootFolderName || company.oneDrive?.rootFolderUrl || 'Default OneDrive folder not configured';
    case 'browser_download': return company.browserDownload?.suggestedSubfolder || 'Browser download folder selected by the user';
    case 'local_folder': return company.localFolder?.displayName || company.localFolder?.rootPath || 'Local folder metadata not configured';
    case 'external_link': return 'External link configured per client';
    default: return 'Storage location not configured';
  }
}

private syncClientStorageDraft(data: Client | null) {
  const storage = data?.documentStorage;
  this.clientStorageProvider.set(storage?.inheritCompanyDefault === false && storage.provider ? storage.provider : 'company_default');
  this.clientStorageLocation.set(storage?.folderName || storage?.folderUrl || storage?.localPath || storage?.externalUrl || '');
  this.clientStorageFolderId.set(storage?.folderId || storage?.folderMetadata?.folderId || '');
}

async saveClientStorage() {
  const companyId = this.companyId();
  const clientId = this.clientId();
  if (!companyId || !clientId) return;
  const provider = this.clientStorageProvider();
  const location = this.clientStorageLocation().trim();
  const folderId = this.clientStorageFolderId().trim();
  this.savingClientStorage.set(true);
  this.clientStorageMessage.set('');
  try {
    await this.documentStorageService.setClientStorage(companyId, clientId, {
      inheritCompanyDefault: provider === 'company_default',
      provider: provider === 'company_default' ? undefined : provider,
      folderId: folderId || undefined,
      folderName: location || undefined,
      folderUrl: location.startsWith('http') ? location : undefined,
      localPath: provider === 'local_folder' ? location || undefined : undefined,
      externalUrl: provider === 'external_link' ? location || undefined : undefined,
      folderMetadata: (location || folderId) ? { folderId: folderId || undefined, folderName: location || undefined, folderUrl: location.startsWith('http') ? location : undefined } : undefined,
      fallbackProvider: provider === 'local_folder' && !this.documentStorageService.supportsLocalFolderAccess() ? 'browser_download' : undefined,
    });
    this.clientStorageMessage.set('Client document storage saved.');
    this.notifications.success('Client document storage saved.');
    this.onClientSaved();
  } finally {
    this.savingClientStorage.set(false);
  }
}

copyLastInvoice() {
  const invoiceToCopy = this.lastInvoice();
  if (!invoiceToCopy) return;
  this.addInvoice(invoiceToCopy);
}

async sendInvoiceReminder(invoice: InvoiceRecord): Promise<void> {
  await this.sendDocumentEmail('invoice', invoice, this.reminderTypeForInvoice(invoice));
}

reminderTypeForInvoice(invoice: InvoiceRecord): InvoiceReminderType {
  if (this.isPastDue(invoice.dueDate)) return 'overdue';
  if (this.isDueToday(invoice.dueDate)) return 'dueToday';
  return 'beforeDue';
}

reminderLabel(invoice: InvoiceRecord): string {
  const type = this.reminderTypeForInvoice(invoice);
  if (type === 'overdue') return 'Send overdue reminder';
  if (type === 'dueToday') return 'Send due-today reminder';
  return 'Send reminder';
}

private isDueToday(value: any): boolean {
  if (!value) return false;
  const dueDate = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(dueDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate.getTime() === today.getTime();
}

canSendReminder(invoice: InvoiceRecord): boolean {
  return this.normalizedInvoiceStatus(invoice) !== 'paid' && this.normalizedInvoiceStatus(invoice) !== 'draft' && this.invoiceOutstanding(invoice) > 0;
}

async sendDocumentEmail(documentType: EmailDocumentType, document: any, reminderType?: InvoiceReminderType): Promise<void> {
  const companyId = this.companyId();
  const clientId = this.clientId();
  if (!companyId || !clientId || !document?.id) return;
  const request = await this.emailService.buildDefaultRequest(documentType, document, companyId, clientId, this.client()?.email || '', this.client(), reminderType);
  const ref = this.dialog.open(EmailComposeDialogComponent, {
    backdropClass: 'dlg-backdrop',
    panelClass: 'dlg-panel',
    disableClose: true,
    data: {
      request,
      attachmentName: request.attachment?.fileName || document.filename || document.title || document.invoiceNumber
    }
  });

  ref.closed.subscribe(sent => {
    if (sent) {
      this.notifications.success(reminderType
        ? `Invoice reminder sent to ${request.recipient}.`
        : `${documentType === 'invoice' ? 'Invoice' : 'Letter'} email sent to ${request.recipient}.`
      );
    }
  });
}

}

type ClientTab = 'overview' | 'details' | 'documents' | 'invoices' | 'expenses' | 'letters';
