export type DocumentStorageProvider =
  | 'google_drive'
  | 'onedrive'
  | 'nexus_storage'
  | 'local'
  | 'external_link';

export interface CompanyDocumentStorageSettings {
  companyId: string;
  defaultProvider: DocumentStorageProvider;

  googleDrive?: {
    connected: boolean;
    rootFolderId?: string;
    rootFolderName?: string;
    rootFolderUrl?: string;
    connectedAt?: any;
  };

  oneDrive?: {
    connected: boolean;
    rootFolderId?: string;
    rootFolderName?: string;
    rootFolderUrl?: string;
    connectedAt?: any;
  };

  nexusStorage?: {
    enabled: boolean;
    plan: 'none' | '1gb' | '5gb' | '10gb';
    usedBytes?: number;
    rootPath?: string;
  };

  local?: {
    enabled: boolean;
    rootPath?: string;
    displayName?: string;
  };

  updatedAt?: any;
}

export interface ClientDocumentStorageSettings {
  provider?: DocumentStorageProvider;
  inheritCompanyDefault?: boolean;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  localPath?: string;
  externalUrl?: string;
  updatedAt?: any;
}

export const DOCUMENT_STORAGE_PROVIDER_LABELS: Record<DocumentStorageProvider, string> = {
  google_drive: 'Google Drive',
  onedrive: 'OneDrive',
  nexus_storage: 'Nexus Storage',
  local: 'Local Folder',
  external_link: 'External Link',
};

export const DEFAULT_DOCUMENT_STORAGE_SETTINGS: Omit<CompanyDocumentStorageSettings, 'companyId'> = {
  defaultProvider: 'nexus_storage',
  googleDrive: { connected: false },
  oneDrive: { connected: false },
  nexusStorage: { enabled: true, plan: 'none', usedBytes: 0, rootPath: 'documents' },
  local: { enabled: false },
};
