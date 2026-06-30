import { inject, Injectable } from '@angular/core';
import { doc, docData, Firestore, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import {
  ClientDocumentStorageSettings,
  CompanyDocumentStorageSettings,
  DEFAULT_DOCUMENT_STORAGE_SETTINGS,
  DocumentStorageProvider,
} from '../models/document-storage.model';

@Injectable({ providedIn: 'root' })
export class DocumentStorageService {
  private db = inject(Firestore);

  getCompanySettings(companyId: string): Observable<CompanyDocumentStorageSettings> {
    return docData(doc(this.db, `companies/${companyId}`)).pipe(
      map((company: any) => this.normalizeCompanySettings(companyId, company?.documentStorage))
    );
  }

  async saveCompanySettings(companyId: string, settings: Partial<CompanyDocumentStorageSettings>): Promise<void> {
    await setDoc(doc(this.db, `companies/${companyId}`), {
      documentStorage: {
        ...settings,
        companyId,
        updatedAt: serverTimestamp(),
      },
    }, { merge: true });
  }

  async setClientStorage(companyId: string, clientId: string, settings: ClientDocumentStorageSettings): Promise<void> {
    await updateDoc(doc(this.db, `companies/${companyId}/clients/${clientId}`), {
      documentStorage: {
        ...settings,
        updatedAt: serverTimestamp(),
      },
    });
  }

  providerLabel(provider?: DocumentStorageProvider): string {
    switch (provider) {
      case 'google_drive': return 'Google Drive';
      case 'onedrive': return 'OneDrive';
      case 'nexus_storage': return 'Nexus Storage';
      case 'local': return 'Local Folder';
      case 'external_link': return 'External Link';
      default: return 'Company default';
    }
  }

  private normalizeCompanySettings(companyId: string, settings?: Partial<CompanyDocumentStorageSettings>): CompanyDocumentStorageSettings {
    return {
      companyId,
      ...DEFAULT_DOCUMENT_STORAGE_SETTINGS,
      ...settings,
      googleDrive: { connected: false, ...settings?.googleDrive },
      oneDrive: { connected: false, ...settings?.oneDrive },
      nexusStorage: { enabled: true, plan: 'none', usedBytes: 0, rootPath: 'documents', ...settings?.nexusStorage },
      local: { enabled: false, ...settings?.local },
    };
  }
}
