import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';

import { TemplateService } from './template.service';
import { ActivityService } from './activity.service';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Storage, useValue: {} },
        { provide: Firestore, useValue: {} },
        { provide: ActivityService, useValue: { track: (_companyId: string, _changeType: string, _entityPath: string, _description: string, operation: () => Promise<unknown>) => operation() } }
      ]
    });
    service = TestBed.inject(TemplateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('rejects missing templates', async () => {
    await expectAsync(service.upload('company-a', undefined as unknown as File))
      .toBeRejectedWithError('Template file is required.');
  });

  it('rejects invalid template file types', async () => {
    const file = new File(['not a docx'], 'invoice.txt', { type: 'text/plain' });

    await expectAsync(service.upload('company-a', file))
      .toBeRejectedWithError('Template must be a .docx file.');
  });

  it('rejects missing template paths', async () => {
    await expectAsync(service.getDownloadUrl(''))
      .toBeRejectedWithError('Template path is required.');
  });
});
