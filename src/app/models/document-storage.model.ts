export type DocumentStorageProvider =
  | 'browser_download'
  | 'google_drive'
  | 'onedrive'
  | 'local_folder'
  | 'external_link';

export type LegacyDocumentStorageProvider = 'nexus_storage' | 'local';

export type CloudDocumentStorageProvider = 'google_drive' | 'onedrive';

export interface FolderMetadata {
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  displayName?: string;
  path?: string;
}

export interface CompanyDocumentStorageSettings {
  companyId: string;
  defaultProvider: DocumentStorageProvider;
  selectedProvider?: DocumentStorageProvider;
  selectedFolder?: FolderMetadata;

  browserDownload?: {
    enabled: boolean;
    suggestedSubfolder?: string;
  };

  googleDrive?: {
    connected: boolean;
    authorizationUrl?: string;
    accountEmail?: string;
    rootFolderId?: string;
    rootFolderName?: string;
    rootFolderUrl?: string;
    connectedAt?: any;
    expiresAt?: any;
    scopes?: string[];
  };

  oneDrive?: {
    connected: boolean;
    authorizationUrl?: string;
    accountEmail?: string;
    tenantId?: string;
    driveId?: string;
    rootFolderId?: string;
    rootFolderName?: string;
    rootFolderUrl?: string;
    connectedAt?: any;
    expiresAt?: any;
    scopes?: string[];
  };

  localFolder?: {
    enabled: boolean;
    supported: boolean;
    rootPath?: string;
    displayName?: string;
    fallbackProvider: 'browser_download';
  };

  updatedAt?: any;
}

export interface ClientDocumentStorageSettings {
  provider?: DocumentStorageProvider;
  selectedProvider?: DocumentStorageProvider;
  inheritCompanyDefault?: boolean;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  localPath?: string;
  externalUrl?: string;
  folderMetadata?: FolderMetadata;
  fallbackProvider?: 'browser_download';
  updatedAt?: any;
}

export const DOCUMENT_STORAGE_PROVIDER_LABELS: Record<DocumentStorageProvider, string> = {
  browser_download: 'Browser Download',
  google_drive: 'Google Workspace Drive',
  onedrive: 'Microsoft 365 OneDrive',
  local_folder: 'Local Folder (future)',
  external_link: 'External Link',
};

export const DEFAULT_DOCUMENT_STORAGE_SETTINGS: Omit<CompanyDocumentStorageSettings, 'companyId'> = {
  defaultProvider: 'browser_download',
  selectedProvider: 'browser_download',
  browserDownload: { enabled: true },
  googleDrive: { connected: false },
  oneDrive: { connected: false },
  localFolder: { enabled: false, supported: false, fallbackProvider: 'browser_download' },
};


export interface GeneratedDocumentSaveRequest {
  companyId: string;
  clientId?: string;
  clientName?: string;
  documentType: 'invoice' | 'letter';
  documentId?: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
}

export interface GeneratedDocumentSaveResult {
  provider: DocumentStorageProvider;
  fallbackProvider?: 'browser_download';
  fileName: string;
  folderId?: string;
  folderName?: string;
  webUrl?: string;
  id?: string;
  uploaded: boolean;
  fallback: boolean;
  error?: string;
}
