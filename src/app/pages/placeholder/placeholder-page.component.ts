import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { doc, docData, Firestore, updateDoc } from '@angular/fire/firestore';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { CurrencyService } from '../../services/currency.service';
import { DocumentStorageService } from '../../services/document-storage.service';
import { ActivityService } from '../../services/activity.service';
import { CompanyContextService } from '../../services/company-context.service';
import { CompanyDocumentStorageSettings, DocumentStorageProvider } from '../../models/document-storage.model';

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
        <p>Select workspace defaults for currency and document storage.</p>

        <form [formGroup]="form" (ngSubmit)="saveCurrency()" class="settings-form compact-form">
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

        <section class="storage-section" [formGroup]="storageForm">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Document Storage</p>
              <h2>Default document storage provider</h2>
              <p>Choose where client documents should be saved by default. Browser downloads, cloud providers, and future local-folder integrations are tracked separately.</p>
            </div>
            <button class="primary" type="button" (click)="saveDocumentStorage()" [disabled]="savingStorage() || !companyId()">
              {{ savingStorage() ? 'Saving…' : 'Save Storage Settings' }}
            </button>
          </div>

          <label for="defaultProvider">Company default provider</label>
          <select id="defaultProvider" formControlName="defaultProvider">
            <option value="browser_download">Browser Download</option>
            <option value="google_drive">Google Drive</option>
            <option value="onedrive">OneDrive</option>
            <option value="local_folder">Local Folder (future)</option>
            <option value="external_link">External Link</option>
          </select>

          <div class="provider-grid">
            <article class="provider-card">
              <h3>Browser Download</h3><span class="status">Always available</span>
              <p class="muted">Generated DOCX files are saved with the browser download flow. Users choose or move files using their browser or operating-system download settings.</p>
              <label>Suggested subfolder label<input formControlName="browserDownloadFolder" placeholder="e.g. Client documents"></label>
            </article>
            <article class="provider-card">
              <h3>Google Drive</h3><span class="status">{{ storage()?.googleDrive?.connected ? 'Connected' : 'Not connected' }}</span>
              <button class="secondary" type="button">Connect Google Drive</button>
              <label>Default Drive Folder<input formControlName="googleDriveFolder" placeholder="Select or link a company folder"></label>
            </article>
            <article class="provider-card">
              <h3>OneDrive</h3><span class="status">{{ storage()?.oneDrive?.connected ? 'Connected' : 'Not connected' }}</span>
              <button class="secondary" type="button">Connect OneDrive</button>
              <label>Default OneDrive Folder<input formControlName="oneDriveFolder" placeholder="Select or link a company folder"></label>
            </article>
            <article class="provider-card future-card">
              <h3>Local Folder (future)</h3><span class="status">{{ localFolderSupportMessage }}</span>
              <button class="secondary" type="button" disabled>Set Local Folder</button>
              <label>Folder metadata<input formControlName="localFolderPath" placeholder="Future folder handle display name or path"></label>
              <p class="muted">Evaluation: File System Access API is the best browser-local option for Chromium browsers, but unsupported browsers must fall back to browser downloads until a desktop wrapper or cloud provider is selected.</p>
            </article>
          </div>
        </section>

        <p class="msg" *ngIf="message()">{{ message() }}</p>
      </section>
      <ng-template #placeholder><section class="card"><h1>{{ sectionName }}</h1><p>This section will manage {{ sectionName }}.</p></section></ng-template>
    </main>
  `,
  styles: [`
    .placeholder-wrap { max-width: 1100px; margin: 24px auto; padding: 0 20px; } .crumbs { margin-bottom: 16px; color: #64748b; } .crumbs a { color: #2563eb; text-decoration: none; }
    .card, .provider-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(15, 23, 42, .06); } h1, h2, h3 { margin-top: 0; }
    .settings-form, .provider-card label { display: grid; gap: 8px; } .compact-form { max-width: 420px; margin-top: 20px; } select, input { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; }
    .primary, .secondary { border-radius: 999px; padding: 10px 18px; font-weight: 700; cursor: pointer; } .primary { border: 0; background: #092c7d; color: #fff; } .secondary { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; } .primary:disabled { opacity: .65; cursor: not-allowed; }
    .storage-section { display: grid; gap: 16px; margin-top: 32px; } .section-heading { display: flex; justify-content: space-between; gap: 16px; align-items: start; } .eyebrow { color: #2563eb; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    .provider-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; } .provider-card { display: grid; gap: 12px; box-shadow: none; } .status { color: #64748b; font-weight: 700; } .muted { color: #64748b; font-size: .9rem; } .msg { color: #007a53; font-weight: 700; }
  `]
})
export class PlaceholderPageComponent {
  private route = inject(ActivatedRoute); private fb = inject(FormBuilder); private db = inject(Firestore); private currencyService = inject(CurrencyService); private storageService = inject(DocumentStorageService); private activityService = inject(ActivityService); private companyContext = inject(CompanyContextService);
  sectionName = this.route.snapshot.data['sectionName'] ?? 'this section'; isSettings = this.sectionName === 'Settings'; currencyOptions = this.currencyService.options; companyId = signal<string | null>(null); saving = signal(false); savingStorage = signal(false); message = signal(''); storage = signal<CompanyDocumentStorageSettings | null>(null);
  form = this.fb.nonNullable.group({ currency: [this.currencyService.defaultCurrency] });
  storageForm = this.fb.nonNullable.group({ defaultProvider: ['browser_download' as DocumentStorageProvider], browserDownloadFolder: [''], googleDriveFolder: [''], oneDriveFolder: [''], localFolderPath: [''] });
  localFolderSupportMessage = this.storageService.localFolderFallbackMessage();

  constructor() {
    if (!this.isSettings) return;
    this.companyContext.currentCompanyId$().pipe(take(1)).subscribe(companyId => {
      this.companyId.set(companyId);
      if (!companyId) return;
      this.companyContext.currentCompany$().pipe(take(1)).subscribe((company: any) => {
        this.form.controls.currency.setValue(this.currencyService.normalize(company?.currency));
      });
      this.storageService.getCompanySettings(companyId).pipe(take(1)).subscribe(settings => {
        this.storage.set(settings);
        this.storageForm.patchValue({ defaultProvider: settings.defaultProvider, browserDownloadFolder: settings.browserDownload?.suggestedSubfolder || '', googleDriveFolder: settings.googleDrive?.rootFolderName || settings.googleDrive?.rootFolderUrl || '', oneDriveFolder: settings.oneDrive?.rootFolderName || settings.oneDrive?.rootFolderUrl || '', localFolderPath: settings.localFolder?.rootPath || settings.localFolder?.displayName || '' });
      });
    });
  }

  async saveCurrency() { const companyId = this.companyId(); if (!companyId) return; this.saving.set(true); this.message.set(''); try { await this.activityService.track(companyId, 'update', `companies/${companyId}`, 'Updated company currency settings.', () => updateDoc(doc(this.db, `companies/${companyId}`), { currency: this.currencyService.normalize(this.form.controls.currency.value) })); this.message.set('Currency settings saved.'); } finally { this.saving.set(false); } }

  async saveDocumentStorage() { const companyId = this.companyId(); if (!companyId) return; const value = this.storageForm.getRawValue(); const selectedFolder = this.folderMetadataFor(value.defaultProvider, value); this.savingStorage.set(true); this.message.set(''); try { await this.storageService.saveCompanySettings(companyId, { defaultProvider: value.defaultProvider, selectedProvider: value.defaultProvider, selectedFolder, browserDownload: { enabled: true, suggestedSubfolder: value.browserDownloadFolder || undefined }, googleDrive: { connected: this.storage()?.googleDrive?.connected || false, rootFolderName: value.googleDriveFolder || undefined }, oneDrive: { connected: this.storage()?.oneDrive?.connected || false, rootFolderName: value.oneDriveFolder || undefined }, localFolder: { enabled: value.defaultProvider === 'local_folder', supported: this.storageService.supportsLocalFolderAccess(), rootPath: value.localFolderPath || undefined, displayName: value.localFolderPath || undefined, fallbackProvider: 'browser_download' } }); this.message.set(value.defaultProvider === 'local_folder' && !this.storageService.supportsLocalFolderAccess() ? 'Local folder APIs are unsupported in this browser. Browser download fallback saved.' : 'Document storage settings saved.'); } finally { this.savingStorage.set(false); } }

  private folderMetadataFor(provider: DocumentStorageProvider, value: ReturnType<typeof this.storageForm.getRawValue>) {
    if (provider === 'google_drive') return { folderName: value.googleDriveFolder || undefined, folderUrl: value.googleDriveFolder?.startsWith('http') ? value.googleDriveFolder : undefined };
    if (provider === 'onedrive') return { folderName: value.oneDriveFolder || undefined, folderUrl: value.oneDriveFolder?.startsWith('http') ? value.oneDriveFolder : undefined };
    if (provider === 'local_folder') return { displayName: value.localFolderPath || undefined, path: value.localFolderPath || undefined };
    if (provider === 'browser_download') return { displayName: value.browserDownloadFolder || 'Browser downloads' };
    return undefined;
  }
}
