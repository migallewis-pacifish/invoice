import { inject, Injectable } from '@angular/core';
import { doc, docData, Firestore, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import {
  ClientDocumentStorageSettings,
  CompanyDocumentStorageSettings,
  DEFAULT_DOCUMENT_STORAGE_SETTINGS,
  DocumentStorageProvider,
} from '../models/document-storage.model';
import { ActivityService } from './activity.service';

@Injectable({ providedIn: 'root' })
export class DocumentStorageService {
  private db = inject(Firestore);
  private activityService = inject(ActivityService);

  getCompanySettings(companyId: string): Observable<CompanyDocumentStorageSettings> {
    return docData(doc(this.db, `companies/${companyId}`)).pipe(
      map((company: any) => this.normalizeCompanySettings(companyId, company?.documentStorage))
    );
  }

  async saveCompanySettings(companyId: string, settings: Partial<CompanyDocumentStorageSettings>): Promise<void> {
    await this.activityService.track(
      companyId,
      'update',
      `companies/${companyId}`,
      'Updated company document storage settings.',
      () => setDoc(doc(this.db, `companies/${companyId}`), {
        documentStorage: {
          ...settings,
          companyId,
          updatedAt: serverTimestamp(),
        },
      }, { merge: true })
    );
  }

  async setClientStorage(companyId: string, clientId: string, settings: ClientDocumentStorageSettings): Promise<void> {
    await this.activityService.track(
      companyId,
      'update',
      `companies/${companyId}/clients/${clientId}`,
      `Updated document storage settings for client ${clientId}.`,
      () => updateDoc(doc(this.db, `companies/${companyId}/clients/${clientId}`), {
        documentStorage: {
          ...settings,
          updatedAt: serverTimestamp(),
        },
      })
    );
  }

  providerLabel(provider?: DocumentStorageProvider): string {
    switch (provider) {
      case 'google_drive': return 'Google Workspace Drive';
      case 'onedrive': return 'Microsoft 365 OneDrive';
      case 'browser_download': return 'Browser Download';
      case 'local_folder': return 'Local Folder (future)';
      case 'external_link': return 'External Link';
      default: return 'Company default';
    }
  }

  supportsLocalFolderAccess(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  localFolderFallbackMessage(): string {
    return this.supportsLocalFolderAccess()
      ? 'Local folder access is available in this browser, but durable sync still requires an explicit folder permission flow.'
      : 'Local folder access is not supported in this browser. Documents will fall back to browser downloads.';
  }

  private normalizeProvider(provider?: DocumentStorageProvider | 'nexus_storage' | 'local'): DocumentStorageProvider {
    if (provider === 'local') return 'browser_download';
    if (provider === 'nexus_storage') return 'browser_download';
    return provider || DEFAULT_DOCUMENT_STORAGE_SETTINGS.defaultProvider;
  }

  private normalizeCompanySettings(companyId: string, settings?: Partial<CompanyDocumentStorageSettings> & { nexusStorage?: any; local?: any }): CompanyDocumentStorageSettings {
    const defaultProvider = this.normalizeProvider(settings?.defaultProvider as DocumentStorageProvider | 'nexus_storage' | 'local' | undefined);
    const selectedProvider = this.normalizeProvider(settings?.selectedProvider as DocumentStorageProvider | 'nexus_storage' | 'local' | undefined) || defaultProvider;
    const legacyLocal = settings?.local;
    return {
      companyId,
      ...DEFAULT_DOCUMENT_STORAGE_SETTINGS,
      ...settings,
      defaultProvider,
      selectedProvider,
      browserDownload: { enabled: true, ...settings?.browserDownload },
      googleDrive: { connected: false, ...settings?.googleDrive },
      oneDrive: { connected: false, ...settings?.oneDrive },
      localFolder: {
        enabled: false,
        supported: this.supportsLocalFolderAccess(),
        fallbackProvider: 'browser_download',
        ...legacyLocal,
        ...settings?.localFolder,
      },
    };
  }
}
