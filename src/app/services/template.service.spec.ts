import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';

import { selectDefaultTemplate, TemplateService } from './template.service';
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


  it('shows the expected user-facing message when template generation receives a missing file', async () => {
    await expectAsync(service.upload('company-a', undefined as unknown as File))
      .toBeRejectedWithError('Template file is required.');
  });

  it('rejects invalid template file types', async () => {
    const file = new File(['not a docx'], 'invoice.txt', { type: 'text/plain' });

    await expectAsync(service.upload('company-a', file))
      .toBeRejectedWithError('Template must be a .docx file.');
  });


  it('selects configured default templates before flag fallback', () => {
    const templates = [
      template('invoice-a', 'invoice', true),
      template('invoice-b', 'invoice', false),
      template('letter-a', 'letter', true)
    ];

    expect(selectDefaultTemplate(templates, 'invoice', 'invoice-b')?.id).toBe('invoice-b');
    expect(selectDefaultTemplate(templates, 'letter')?.id).toBe('letter-a');
  });

  it('does not select archived default templates', () => {
    const templates = [
      template('invoice-archived', 'invoice', true, true),
      template('invoice-active', 'invoice', false)
    ];

    expect(selectDefaultTemplate(templates, 'invoice')?.id).toBe('invoice-active');
  });

  it('rejects missing template paths', async () => {
    await expectAsync(service.getDownloadUrl(''))
      .toBeRejectedWithError('Template path is required.');
  });
});

function template(id: string, type: 'invoice' | 'letter', isDefault: boolean, archived = false) {
  return { id, companyId: 'company-a', type, name: id, storagePath: `${id}.docx`, isDefault, archived };
}
