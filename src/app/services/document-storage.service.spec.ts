import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { ActivityService } from './activity.service';
import { DocumentStorageService } from './document-storage.service';

describe('DocumentStorageService', () => {
  let service: DocumentStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: ActivityService, useValue: { track: (_c: string, _t: string, _p: string, _d: string, op: () => Promise<unknown>) => op() } }
      ]
    });
    service = TestBed.inject(DocumentStorageService);
  });

  it('returns user-friendly provider labels', () => {
    expect(service.providerLabel('google_drive')).toBe('Google Workspace Drive');
    expect(service.providerLabel('onedrive')).toBe('Microsoft 365 OneDrive');
    expect(service.providerLabel('browser_download')).toBe('Browser Download');
    expect(service.providerLabel('local_folder')).toBe('Local Folder (future)');
    expect(service.providerLabel('external_link')).toBe('External Link');
    expect(service.providerLabel(undefined)).toBe('Company default');
  });

  it('normalizes missing nested settings with safe defaults', () => {
    const normalized = (service as any).normalizeCompanySettings('company-1', { defaultProvider: 'local_folder', localFolder: { rootPath: '/docs' } });

    expect(normalized.companyId).toBe('company-1');
    expect(normalized.defaultProvider).toBe('local_folder');
    expect(normalized.googleDrive.connected).toBeFalse();
    expect(normalized.oneDrive.connected).toBeFalse();
    expect(normalized.browserDownload).toEqual(jasmine.objectContaining({ enabled: true }));
    expect(normalized.localFolder).toEqual(jasmine.objectContaining({ enabled: false, rootPath: '/docs', fallbackProvider: 'browser_download' }));
  });
});
