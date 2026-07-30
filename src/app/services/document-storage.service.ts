import { inject, Injectable } from '@angular/core';
import { doc, docData, Firestore, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { saveAs } from 'file-saver';
import { firstValueFrom, map, Observable } from 'rxjs';
import {
  ClientDocumentStorageSettings,
  CloudDocumentStorageProvider,
  CompanyDocumentStorageSettings,
  DEFAULT_DOCUMENT_STORAGE_SETTINGS,
  DocumentStorageProvider,
  FolderMetadata,
  GeneratedDocumentSaveRequest,
  GeneratedDocumentSaveResult,
} from '../models/document-storage.model';
import { ActivityService } from './activity.service';

@Injectable({ providedIn: 'root' })
export class DocumentStorageService {
  private db = inject(Firestore);
  private functions = inject(Functions, { optional: true });
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

  async startCloudConnection(companyId: string, provider: CloudDocumentStorageProvider): Promise<string> {
    if (!this.functions) throw new Error('Firebase Functions is not configured.');
    const callable = httpsCallable<{ companyId: string; provider: CloudDocumentStorageProvider }, { authorizationUrl: string }>(this.functions, 'startDocumentStorageConnection');
    const result = await callable({ companyId, provider });
    await this.saveCompanySettings(companyId, { [this.providerKey(provider)]: { connected: false, authorizationUrl: result.data.authorizationUrl } } as Partial<CompanyDocumentStorageSettings>);
    return result.data.authorizationUrl;
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

  async saveGeneratedDocument(request: GeneratedDocumentSaveRequest): Promise<GeneratedDocumentSaveResult> {
    const settings = await firstValueFrom(this.getCompanySettings(request.companyId));
    const clientStorage = request.clientId ? await this.getClientStorage(request.companyId, request.clientId) : undefined;
    const provider = this.resolveProvider(settings, clientStorage);
    const folder = this.resolveFolder(provider, settings, clientStorage);

    if (!this.isConnected(settings, provider) || provider === 'browser_download' || provider === 'local_folder' || provider === 'external_link' || !this.functions) {
      this.downloadInBrowser(request.blob, request.clientName, request.fileName);
      return { provider: 'browser_download', fileName: request.fileName, uploaded: false, fallback: true };
    }

    try {
      const callable = httpsCallable<any, GeneratedDocumentSaveResult>(this.functions, 'uploadGeneratedDocument');
      const result = await callable({
        companyId: request.companyId,
        clientId: request.clientId,
        documentType: request.documentType,
        documentId: request.documentId,
        provider,
        folderId: folder?.folderId,
        fileName: request.fileName,
        mimeType: request.mimeType,
        base64: await this.blobToBase64(request.blob),
      });
      return { ...result.data, provider, fileName: request.fileName, uploaded: true, fallback: false };
    } catch (error: any) {
      this.downloadInBrowser(request.blob, request.clientName, request.fileName);
      return { provider, fallbackProvider: 'browser_download', fileName: request.fileName, uploaded: false, fallback: true, error: error?.message || String(error) };
    }
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

  supportsLocalFolderAccess(): boolean { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; }
  localFolderFallbackMessage(): string { return this.supportsLocalFolderAccess() ? 'Local folder access is available in this browser, but durable sync still requires an explicit folder permission flow.' : 'Local folder access is not supported in this browser. Documents will fall back to browser downloads.'; }

  private async getClientStorage(companyId: string, clientId: string): Promise<ClientDocumentStorageSettings | undefined> {
    const client: any = await firstValueFrom(docData(doc(this.db, `companies/${companyId}/clients/${clientId}`)));
    return client?.documentStorage;
  }

  private resolveProvider(company: CompanyDocumentStorageSettings, client?: ClientDocumentStorageSettings): DocumentStorageProvider {
    return client?.inheritCompanyDefault === false ? this.normalizeProvider(client.provider || client.selectedProvider) : this.normalizeProvider(company.selectedProvider || company.defaultProvider);
  }

  private resolveFolder(provider: DocumentStorageProvider, company: CompanyDocumentStorageSettings, client?: ClientDocumentStorageSettings): FolderMetadata | undefined {
    if (client?.inheritCompanyDefault === false) return client.folderMetadata || { folderId: client.folderId, folderName: client.folderName, folderUrl: client.folderUrl, path: client.localPath };
    if (provider === 'google_drive') return { folderId: company.googleDrive?.rootFolderId, folderName: company.googleDrive?.rootFolderName, folderUrl: company.googleDrive?.rootFolderUrl };
    if (provider === 'onedrive') return { folderId: company.oneDrive?.rootFolderId, folderName: company.oneDrive?.rootFolderName, folderUrl: company.oneDrive?.rootFolderUrl };
    return company.selectedFolder;
  }

  private isConnected(settings: CompanyDocumentStorageSettings, provider: DocumentStorageProvider): boolean {
    return provider === 'google_drive' ? !!settings.googleDrive?.connected : provider === 'onedrive' ? !!settings.oneDrive?.connected : false;
  }

  private normalizeProvider(provider?: DocumentStorageProvider | 'nexus_storage' | 'local'): DocumentStorageProvider {
    return provider === 'local' || provider === 'nexus_storage' ? 'browser_download' : provider || DEFAULT_DOCUMENT_STORAGE_SETTINGS.defaultProvider;
  }

  private normalizeCompanySettings(companyId: string, settings?: Partial<CompanyDocumentStorageSettings> & { nexusStorage?: any; local?: any }): CompanyDocumentStorageSettings {
    const defaultProvider = this.normalizeProvider(settings?.defaultProvider as any);
    const selectedProvider = this.normalizeProvider(settings?.selectedProvider as any) || defaultProvider;
    const legacyLocal = settings?.local;
    return { companyId, ...DEFAULT_DOCUMENT_STORAGE_SETTINGS, ...settings, defaultProvider, selectedProvider, browserDownload: { enabled: true, ...settings?.browserDownload }, googleDrive: { connected: false, ...settings?.googleDrive }, oneDrive: { connected: false, ...settings?.oneDrive }, localFolder: { enabled: false, supported: this.supportsLocalFolderAccess(), fallbackProvider: 'browser_download', ...legacyLocal, ...settings?.localFolder } };
  }

  private providerKey(provider: CloudDocumentStorageProvider): 'googleDrive' | 'oneDrive' { return provider === 'google_drive' ? 'googleDrive' : 'oneDrive'; }
  private downloadInBrowser(file: Blob, clientName = 'client', fileName: string): void { saveAs(file, `${clientName}/${fileName}`); }
  private blobToBase64(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
}
