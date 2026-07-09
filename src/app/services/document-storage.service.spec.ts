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
    expect(service.providerLabel('google_drive')).toBe('Google Drive');
    expect(service.providerLabel('onedrive')).toBe('OneDrive');
    expect(service.providerLabel('nexus_storage')).toBe('Nexus Storage');
    expect(service.providerLabel('local')).toBe('Local Folder');
    expect(service.providerLabel('external_link')).toBe('External Link');
    expect(service.providerLabel(undefined)).toBe('Company default');
  });

  it('normalizes missing nested settings with safe defaults', () => {
    const normalized = (service as any).normalizeCompanySettings('company-1', { defaultProvider: 'local', local: { rootPath: '/docs' } });

    expect(normalized.companyId).toBe('company-1');
    expect(normalized.defaultProvider).toBe('local');
    expect(normalized.googleDrive.connected).toBeFalse();
    expect(normalized.oneDrive.connected).toBeFalse();
    expect(normalized.nexusStorage).toEqual(jasmine.objectContaining({ enabled: true, plan: 'none', usedBytes: 0, rootPath: 'documents' }));
    expect(normalized.local).toEqual(jasmine.objectContaining({ enabled: false, rootPath: '/docs' }));
  });
});
