import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClientService } from '../../services/client.service';
import { take } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { AddInvoiceDialogComponent } from '../../components/add-invoice-dialog/add-invoice-dialog.component';
import { AddLetterDialogComponent } from '../../components/add-letter-dialog/add-letter-dialog.component';
import { OrderByDateDescPipe } from './order-by-date-desc.pipe';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { CurrencyService } from '../../services/currency.service';
import { InvoiceRecord, InvoiceStatus } from '../../models/invoice.model';
import { Client } from '../../models/client.model';
import { CompanyDocumentStorageSettings, DOCUMENT_STORAGE_PROVIDER_LABELS, DocumentStorageProvider } from '../../models/document-storage.model';
import { DocumentStorageService } from '../../services/document-storage.service';
import { CreateClientComponent } from '../../components/create-client/create-client.component';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavBarComponent, OrderByDateDescPipe, CreateClientComponent],
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
  
  companyId = signal<string | null>(null);
  clientId = signal<string | null>(null);
  client = signal<Client | null>(null);
  invoices = signal<InvoiceRecord[]>([]);
  letters = signal<any[]>([]);
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
  editingClient = signal(false);
  noteDraft = signal('');

  readonly tabs: { id: ClientTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'documents', label: 'Documents' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'letters', label: 'Letters' }
  ];

  readonly documents = [
    { icon: '▣', name: 'NDA_V2.pdf', created: '2 days ago', size: '1.2MB' },
    { icon: '▣', name: 'Service_Agr.pdf', created: '1 week ago', size: '4.5MB' },
    { icon: '▣', name: 'Onboarding.docx', created: '2 weeks ago', size: '980KB' }
  ];

  readonly activityEvents = [
    { icon: '✉', title: 'Email sent to Sarah Jenkins', description: 'Follow up regarding #INV-8711', time: 'Today, 10:45 AM', tone: 'blue' },
    { icon: '✓', title: 'Payment received', description: 'Cleared for #INV-8794 via Bank Transfer', time: 'Yesterday, 4:12 PM', tone: 'green' },
    { icon: '□', title: 'Agreement signed', description: 'Service Agreement signed via DocuSign', time: 'Jun 24, 2026', tone: 'navy' },
    { icon: '•', title: 'Expense created', description: 'Travel expense added to client workspace', time: 'Jun 22, 2026', tone: 'amber' },
    { icon: '↻', title: 'Client updated', description: 'Primary contact details refreshed', time: 'Jun 20, 2026', tone: 'slate' }
  ];

  readonly expenseRows = [
    { expense: 'Travel reimbursement', category: 'Travel', date: 'Jun 18, 2026', amount: 420, status: 'Pending' },
    { expense: 'Client dinner', category: 'Meals', date: 'Jun 14, 2026', amount: 188.40, status: 'Paid' },
    { expense: 'Courier documents', category: 'Operations', date: 'Jun 10, 2026', amount: 38, status: 'Draft' }
  ];

  readonly letterRows = [
    { letter: 'Service agreement', template: 'Enterprise MSA', created: 'Jun 12, 2026', status: 'Generated' },
    { letter: 'Welcome letter', template: 'Onboarding', created: 'Jun 8, 2026', status: 'Sent' },
    { letter: 'Renewal notice', template: 'Renewal', created: 'Jun 2, 2026', status: 'Draft' }
  ];

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
      });

      // Real-time invoices
      this.clientSvc.getInvoicesForClient(clientId).subscribe(list => {
        this.invoices.set(list);
        this.lastInvoice.set(list.length > 0 ? list[0] : null);
      });

      this.clientSvc.getLettersForClient(clientId).subscribe(list => {
        this.letters.set(list);
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
    return this.client()?.displayName || 'Not provided';
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
      console.log('Invoice created:', filename);
    }
  });
}

viewInvoice(invoice: any) {
  this.addInvoice(invoice, true);
}

updateInvoiceTracking(invoice: any) {
  this.addInvoice(invoice, false, true);
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
      console.log('Letter created:', filename);
    }
  });
}

startEditClient() {
  this.activeTab.set('details');
  this.editingClient.set(true);
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
  return DOCUMENT_STORAGE_PROVIDER_LABELS[this.companyStorage()?.defaultProvider || 'nexus_storage'];
}

get effectiveStorageProviderLabel(): string {
  const clientStorage = this.client()?.documentStorage;
  const provider = clientStorage?.inheritCompanyDefault === false && clientStorage.provider
    ? clientStorage.provider
    : this.companyStorage()?.defaultProvider;
  return DOCUMENT_STORAGE_PROVIDER_LABELS[provider || 'nexus_storage'];
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
    case 'local': return company.local?.displayName || company.local?.rootPath || 'Local folder metadata not configured';
    case 'nexus_storage': return company.nexusStorage?.rootPath || 'Nexus Storage root not configured';
    case 'external_link': return 'External link configured per client';
    default: return 'Storage location not configured';
  }
}

private syncClientStorageDraft(data: Client | null) {
  const storage = data?.documentStorage;
  this.clientStorageProvider.set(storage?.inheritCompanyDefault === false && storage.provider ? storage.provider : 'company_default');
  this.clientStorageLocation.set(storage?.folderName || storage?.folderUrl || storage?.localPath || storage?.externalUrl || '');
}

async saveClientStorage() {
  const companyId = this.companyId();
  const clientId = this.clientId();
  if (!companyId || !clientId) return;
  const provider = this.clientStorageProvider();
  const location = this.clientStorageLocation().trim();
  this.savingClientStorage.set(true);
  this.clientStorageMessage.set('');
  try {
    await this.documentStorageService.setClientStorage(companyId, clientId, {
      inheritCompanyDefault: provider === 'company_default',
      provider: provider === 'company_default' ? undefined : provider,
      folderName: location || undefined,
      folderUrl: location.startsWith('http') ? location : undefined,
      localPath: provider === 'local' ? location || undefined : undefined,
      externalUrl: provider === 'external_link' ? location || undefined : undefined,
    });
    this.clientStorageMessage.set('Client document storage saved.');
    this.onClientSaved();
  } finally {
    this.savingClientStorage.set(false);
  }
}

copyLastInvoice() {
  if (this.lastInvoice()) {
    this.addInvoice(this.lastInvoice());
  }
}

}

type ClientTab = 'overview' | 'details' | 'documents' | 'invoices' | 'expenses' | 'letters';
