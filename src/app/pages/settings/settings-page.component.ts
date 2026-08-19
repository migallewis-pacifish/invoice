import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { doc, Firestore, updateDoc } from '@angular/fire/firestore';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { ImageUploadComponent, ImageUploadRequest } from '../../components/image-upload/image-upload.component';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { WorkspaceTopbarComponent } from '../../components/workspace-topbar/workspace-topbar.component';
import { CompanyDocumentStorageSettings, DocumentStorageProvider } from '../../models/document-storage.model';
import { CompanyEmailSettings, EmailProvider } from '../../models/email-integration.model';
import { ActivityService } from '../../services/activity.service';
import { CompanyBrandingService } from '../../services/company-branding.service';
import { AddressFieldsComponent } from '../../components/address-fields/address-fields.component';
import { CompanyContextService } from '../../services/company-context.service';
import { CurrencyService } from '../../services/currency.service';
import { DocumentStorageService } from '../../services/document-storage.service';
import { EmailIntegrationService } from '../../services/email-integration.service';
import { companyAccountPayload, emailSenderFor, folderMetadataFor } from './settings-page.logic';
import { DEFAULT_BRAND_COLORS, brandColorsFrom } from '../../models/brand-colours.model';

export type SettingsTab = 'account' | 'branding' | 'general' | 'storage' | 'email';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, RouterLink, NavBarComponent, WorkspaceTopbarComponent, ReactiveFormsModule, ImageUploadComponent, AddressFieldsComponent],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss'
})
export class SettingsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(Firestore);
  private readonly currencyService = inject(CurrencyService);
  private readonly storageService = inject(DocumentStorageService);
  private readonly emailService = inject(EmailIntegrationService);
  private readonly activityService = inject(ActivityService);
  private readonly companyContext = inject(CompanyContextService);
  private readonly brandingService = inject(CompanyBrandingService);

  readonly settingsTabs = [
    { id: 'account', label: 'Company Account', icon: '●' },
    { id: 'branding', label: 'Branding', icon: '✦' },
    { id: 'general', label: 'General', icon: '⚙' },
    { id: 'storage', label: 'Document Storage', icon: '▣' },
    { id: 'email', label: 'Email', icon: '✉' }
  ] as const;
  readonly currencyOptions = this.currencyService.options;
  readonly localFolderSupportMessage = this.storageService.localFolderFallbackMessage();

  readonly activeTab = signal<SettingsTab>('account');
  readonly companyId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly savingAccount = signal(false);
  readonly savingStorage = signal(false);
  readonly savingEmail = signal(false);
  readonly savingBranding = signal(false);
  readonly message = signal('');
  readonly storage = signal<CompanyDocumentStorageSettings | null>(null);
  readonly emailSettings = signal<CompanyEmailSettings | null>(null);
  readonly gmailConfigured = signal(false);
  readonly microsoftExchangeConfigured = signal(false);
  readonly nexusFallbackConfigured = signal(false);
  readonly nexusFromEmail = signal('');
  readonly logoUrl = signal('');
  readonly signatureUrl = signal('');
  readonly signerName = signal('');
  readonly brandingForm = this.fb.nonNullable.group({
    primary: [DEFAULT_BRAND_COLORS.primary],
    secondary: [DEFAULT_BRAND_COLORS.secondary],
    accent: [DEFAULT_BRAND_COLORS.accent]
  });

  readonly accountForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]], regNo: [''], vatNo: [''], tel: [''],
    email: ['', Validators.email], website: [''], line1: [''], line2: [''], suburb: [''], city: [''],
    province: [''], postalCode: [''], country: ['South Africa'], bankName: [''], accountName: [''],
    accountNumber: [''], branchCode: ['']
  });
  readonly currencyForm = this.fb.nonNullable.group({ currency: [this.currencyService.defaultCurrency] });
  readonly storageForm = this.fb.nonNullable.group({
    defaultProvider: ['browser_download' as DocumentStorageProvider], browserDownloadFolder: [''],
    googleDriveFolder: [''], googleDriveFolderId: [''], oneDriveFolder: [''], oneDriveFolderId: [''], localFolderPath: ['']
  });
  readonly emailForm = this.fb.nonNullable.group({
    defaultProvider: ['' as EmailProvider], gmailAccountEmail: [''], exchangeAccountEmail: [''],
    exchangeTenantId: [''], sendgridFromEmail: [''], sendgridFromName: [''], nexusFallbackEnabled: [false],
    nexusReplyToEmail: ['', Validators.email]
  });

  constructor() {
    this.loadSettings();
    this.reportEmailOAuthResult();
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
    this.message.set('');
  }

  async saveCurrency(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    this.saving.set(true);
    this.message.set('');
    try {
      const currency = this.currencyService.normalize(this.currencyForm.controls.currency.value);
      await this.activityService.track(companyId, 'update', `companies/${companyId}`, 'Updated company currency settings.', () =>
        updateDoc(doc(this.db, `companies/${companyId}`), { currency })
      );
      this.message.set('Currency settings saved.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveCompanyAccount(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }
    this.savingAccount.set(true);
    this.message.set('');
    try {
      const payload = companyAccountPayload(this.accountForm.getRawValue());
      await this.activityService.track(companyId, 'update', `companies/${companyId}`, 'Updated company account details.', () =>
        updateDoc(doc(this.db, `companies/${companyId}`), payload)
      );
      this.message.set('Company account details saved.');
    } catch (error: any) {
      this.message.set(error?.message || 'Unable to save company account details.');
    } finally {
      this.savingAccount.set(false);
    }
  }

  async uploadLogo(request: ImageUploadRequest): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    this.savingBranding.set(true);
    this.message.set('');
    try {
      const asset = await this.brandingService.uploadLogo(companyId, request.file);
      this.logoUrl.set(asset.imageUrl);
      this.message.set('Company logo uploaded and ready for templates.');
    } catch (error: any) {
      this.message.set(error?.message || 'Unable to upload company logo.');
    } finally {
      this.savingBranding.set(false);
    }
  }

  async uploadSignature(request: ImageUploadRequest): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    this.savingBranding.set(true);
    this.message.set('');
    try {
      const asset = await this.brandingService.uploadSignature(companyId, request.file, request.name || '');
      this.signatureUrl.set(asset.imageUrl);
      this.signerName.set(asset.name);
      this.message.set('Default signature uploaded and ready for templates.');
    } catch (error: any) {
      this.message.set(error?.message || 'Unable to upload signature.');
    } finally {
      this.savingBranding.set(false);
    }
  }

  async saveBrandColors(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    this.savingBranding.set(true);
    this.message.set('');
    try {
      const brandColors = this.brandingForm.getRawValue();
      await this.activityService.track(companyId, 'update', `companies/${companyId}`, 'Updated company brand colours.', () =>
        updateDoc(doc(this.db, `companies/${companyId}`), { brandColors })
      );
      this.message.set('Brand colours saved. New templates will use them by default.');
    } catch (error: any) {
      this.message.set(error?.message || 'Unable to save brand colours.');
    } finally {
      this.savingBranding.set(false);
    }
  }

  async saveDocumentStorage(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    const value = this.storageForm.getRawValue();
    this.savingStorage.set(true);
    this.message.set('');
    try {
      await this.storageService.saveCompanySettings(companyId, {
        defaultProvider: value.defaultProvider,
        selectedProvider: value.defaultProvider,
        selectedFolder: folderMetadataFor(value.defaultProvider, value),
        browserDownload: { enabled: true, suggestedSubfolder: value.browserDownloadFolder || undefined },
        googleDrive: { ...this.storage()?.googleDrive, connected: !!this.storage()?.googleDrive?.connected, rootFolderId: value.googleDriveFolderId || undefined, rootFolderName: value.googleDriveFolder || undefined, rootFolderUrl: value.googleDriveFolder.startsWith('http') ? value.googleDriveFolder : undefined },
        oneDrive: { ...this.storage()?.oneDrive, connected: !!this.storage()?.oneDrive?.connected, rootFolderId: value.oneDriveFolderId || undefined, rootFolderName: value.oneDriveFolder || undefined, rootFolderUrl: value.oneDriveFolder.startsWith('http') ? value.oneDriveFolder : undefined },
        localFolder: { enabled: value.defaultProvider === 'local_folder', supported: this.storageService.supportsLocalFolderAccess(), rootPath: value.localFolderPath || undefined, displayName: value.localFolderPath || undefined, fallbackProvider: 'browser_download' }
      });
      this.message.set(value.defaultProvider === 'local_folder' && !this.storageService.supportsLocalFolderAccess()
        ? 'Local folder APIs are unsupported in this browser. Browser download fallback saved.'
        : 'Document storage settings saved.');
    } finally {
      this.savingStorage.set(false);
    }
  }

  async saveEmailSettings(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    const value = this.emailForm.getRawValue();
    if (!value.defaultProvider) {
      this.message.set('Choose a company email provider to complete onboarding.');
      return;
    }
    if (value.nexusFallbackEnabled && this.emailForm.controls.nexusReplyToEmail.invalid) {
      this.emailForm.controls.nexusReplyToEmail.markAsTouched();
      this.message.set('Enter a valid Reply-To address before enabling Nexus email.');
      return;
    }
    this.savingEmail.set(true);
    this.message.set('');
    try {
      await this.emailService.saveCompanySettings(companyId, {
        defaultProvider: value.defaultProvider,
        onboardingCompleted: true,
        selectedSender: emailSenderFor(value.defaultProvider, value),
        nexusFallback: { enabled: value.nexusFallbackEnabled, replyToEmail: value.nexusReplyToEmail || undefined }
      });
      this.message.set('Email integration settings saved. Complete provider authorization in the backend connection flow before sending mail.');
    } finally {
      this.savingEmail.set(false);
    }
  }

  async connectStorageProvider(provider: 'google_drive' | 'onedrive'): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    this.message.set('');
    try {
      const url = await this.storageService.startCloudConnection(companyId, provider);
      this.message.set('Opening secure provider authorization. Tokens are handled by Firebase Functions and are not stored in the browser.');
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    } catch (error: any) {
      this.message.set(error?.message || 'Unable to start provider connection.');
    }
  }

  async connectEmailProvider(provider: 'gmail' | 'microsoft_exchange'): Promise<void> {
    const companyId = this.companyId();
    const configured = provider === 'gmail' ? this.gmailConfigured() : this.microsoftExchangeConfigured();
    if (!companyId || !configured) return;
    this.message.set('');
    try {
      const accountEmail = provider === 'gmail' ? this.emailForm.controls.gmailAccountEmail.value : this.emailForm.controls.exchangeAccountEmail.value;
      const url = await this.emailService.connectEmailProvider(provider, companyId, accountEmail);
      this.message.set(`Opening secure ${provider === 'gmail' ? 'Gmail' : 'Microsoft'} authorization. Refresh tokens remain server-only.`);
      if (typeof window !== 'undefined') window.location.assign(url);
    } catch (error: any) {
      this.message.set(error?.message || 'Unable to start email connection.');
    }
  }

  async verifyCompanySendGrid(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    this.savingEmail.set(true);
    this.message.set('');
    try {
      const sendgrid = await this.emailService.verifyCompanySendGrid(companyId);
      const current = this.emailSettings();
      if (current) this.emailSettings.set({ ...current, sendgrid });
      this.emailForm.patchValue({ sendgridFromEmail: sendgrid?.fromEmail || '', sendgridFromName: sendgrid?.fromName || '' });
      this.message.set('Company SendGrid connection and sending identity verified.');
    } catch (error: any) {
      this.message.set(error?.message || 'Company SendGrid verification failed. Ask an administrator to check the secret and sender authentication.');
    } finally { this.savingEmail.set(false); }
  }

  async disconnectEmailProvider(provider: 'gmail' | 'microsoft_exchange'): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;
    try {
      await this.emailService.disconnectEmailProvider(provider, companyId);
      const current = this.emailSettings();
      if (current) this.emailSettings.set(provider === 'gmail'
        ? { ...current, gmail: { ...current.gmail, connected: false } }
        : { ...current, microsoftExchange: { ...current.microsoftExchange, connected: false } });
      this.message.set(`${provider === 'gmail' ? 'Gmail' : 'Microsoft Exchange'} disconnected.`);
    } catch (error: any) {
      this.message.set(error?.message || 'Unable to disconnect Gmail.');
    }
  }

  private reportEmailOAuthResult(): void {
    if (typeof window === 'undefined') return;
    const query = new URLSearchParams(window.location.search);
    const provider = query.get('emailOAuth');
    if (provider !== 'gmail' && provider !== 'microsoft_exchange') return;
    this.activeTab.set('email');
    const label = provider === 'gmail' ? 'Gmail' : 'Microsoft Exchange';
    this.message.set(query.get('result') === 'success' ? `${label} connected successfully.` : `${label} connection failed: ${query.get('reason') || 'unknown error'}.`);
  }

  private loadSettings(): void {
    this.companyContext.currentCompanyId$().pipe(take(1)).subscribe(companyId => {
      this.companyId.set(companyId);
      if (!companyId) return;
      this.emailService.providerConfiguration().then(configuration => {
        this.gmailConfigured.set(configuration.gmail);
        this.microsoftExchangeConfigured.set(configuration.microsoftExchange);
        this.nexusFallbackConfigured.set(configuration.nexusFallback);
        this.nexusFromEmail.set(configuration.nexusFromEmail || '');
      }).catch(() => { this.gmailConfigured.set(false); this.microsoftExchangeConfigured.set(false); });
      this.loadCompany();
      this.storageService.getCompanySettings(companyId).pipe(take(1)).subscribe(settings => {
        this.storage.set(settings);
        this.storageForm.patchValue({
          defaultProvider: settings.defaultProvider,
          browserDownloadFolder: settings.browserDownload?.suggestedSubfolder || '',
          googleDriveFolder: settings.googleDrive?.rootFolderName || settings.googleDrive?.rootFolderUrl || '',
          googleDriveFolderId: settings.googleDrive?.rootFolderId || '',
          oneDriveFolder: settings.oneDrive?.rootFolderName || settings.oneDrive?.rootFolderUrl || '',
          oneDriveFolderId: settings.oneDrive?.rootFolderId || '',
          localFolderPath: settings.localFolder?.rootPath || settings.localFolder?.displayName || ''
        });
      });
      this.emailService.getCompanySettings(companyId).pipe(take(1)).subscribe(settings => {
        this.emailSettings.set(settings);
        this.emailForm.patchValue({
          defaultProvider: settings.onboardingCompleted ? settings.defaultProvider : '' as EmailProvider,
          gmailAccountEmail: settings.gmail?.accountEmail || '',
          exchangeAccountEmail: settings.microsoftExchange?.accountEmail || '',
          exchangeTenantId: settings.microsoftExchange?.tenantId || '',
          sendgridFromEmail: settings.sendgrid?.fromEmail || '',
          sendgridFromName: settings.sendgrid?.fromName || '',
          nexusFallbackEnabled: settings.nexusFallback?.enabled || false,
          nexusReplyToEmail: settings.nexusFallback?.replyToEmail || ''
        });
      });
    });
  }

  private loadCompany(): void {
    this.companyContext.currentCompany$().pipe(take(1)).subscribe((company: any) => {
      this.currencyForm.controls.currency.setValue(this.currencyService.normalize(company?.currency));
      const address = company?.address || {};
      const banking = company?.banking || company?.bankDetails || {};
      this.accountForm.patchValue({
        name: company?.name || '', regNo: company?.regNo || company?.registrationNumber || '',
        vatNo: company?.vatNo || company?.taxNumber || '', tel: company?.tel || company?.phone || '',
        email: company?.email || '', website: company?.website || '', line1: address.line1 || '',
        line2: address.line2 || '', suburb: address.suburb || '', city: address.city || '',
        province: address.province || '', postalCode: address.postalCode || '', country: address.country || 'South Africa',
        bankName: banking.bankName || '', accountName: banking.accountName || banking.accountHolder || '',
        accountNumber: banking.accountNumber || '', branchCode: banking.branchCode || ''
      });
      this.logoUrl.set(company?.logoUrl || '');
      this.signatureUrl.set(company?.signature?.imageUrl || company?.signature?.url || company?.signatureUrl || '');
      this.signerName.set(company?.signature?.name || '');
      const brandColors = brandColorsFrom(company?.brandColors) ?? DEFAULT_BRAND_COLORS;
      this.brandingForm.setValue(brandColors);
    });
  }
}
