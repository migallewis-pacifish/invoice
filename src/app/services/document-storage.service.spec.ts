import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { ActivityService } from './activity.service';
import { Functions } from '@angular/fire/functions';
import { of } from 'rxjs';
import { DocumentStorageService } from './document-storage.service';

describe('DocumentStorageService', () => {
  let service: DocumentStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: Functions, useValue: null },
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

  it('normalizes legacy providers to browser download', () => {
    expect((service as any).normalizeProvider('nexus_storage')).toBe('browser_download');
    expect((service as any).normalizeProvider('local')).toBe('browser_download');
  });

  it('detects connected and disconnected cloud providers', () => {
    const settings = (service as any).normalizeCompanySettings('company-1', { googleDrive: { connected: true }, oneDrive: { connected: false } });
    expect((service as any).isConnected(settings, 'google_drive')).toBeTrue();
    expect((service as any).isConnected(settings, 'onedrive')).toBeFalse();
  });

  it('falls back to browser download when no cloud function/provider is connected', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    spyOn(service, 'getCompanySettings').and.returnValue(of((service as any).normalizeCompanySettings('company-1', { defaultProvider: 'google_drive', googleDrive: { connected: false } })));
    spyOn<any>(service, 'downloadInBrowser');

    const result = await service.saveGeneratedDocument({ companyId: 'company-1', clientName: 'Client A', documentType: 'invoice', fileName: 'INV-1.docx', mimeType: blob.type, blob });

    expect(result).toEqual(jasmine.objectContaining({ provider: 'browser_download', uploaded: false, fallback: true }));
    expect((service as any).downloadInBrowser).toHaveBeenCalled();
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
