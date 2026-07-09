import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { ActivityService } from './activity.service';
import { TemplateService } from './template.service';
import { LetterDocxService } from './letter-docx.service';

describe('LetterDocxService', () => {
  let service: LetterDocxService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Storage, useValue: {} },
        { provide: HttpClient, useValue: {} },
        { provide: Firestore, useValue: {} },
        { provide: ActivityService, useValue: {} },
        { provide: TemplateService, useValue: { upload: jasmine.createSpy('upload').and.resolveTo({ path: 'p', url: 'u' }) } }
      ]
    });
    service = TestBed.inject(LetterDocxService);
  });

  it('delegates letter template uploads to TemplateService', async () => {
    const templateService = TestBed.inject(TemplateService) as jasmine.SpyObj<TemplateService>;
    const file = new File(['docx'], 'letter.docx');

    await expectAsync(service.uploadTemplate('company-1', file)).toBeResolvedTo({ path: 'p', url: 'u' });
    expect(templateService.upload).toHaveBeenCalledOnceWith('company-1', file, 'letter');
  });

  it('builds template data with client, company, and signature fallbacks', () => {
    const data = (service as any).buildTemplateData(
      { name: 'Acme', regNo: '123', tel: '555', email: 'hello@acme.test', address: { line1: '1 Main', city: 'Cape Town' } },
      { title: 'Welcome', message: 'Hello', client: { displayName: 'Client A', email: 'c@test', address: { line1: '2 Side', line2: 'Unit B' } }, signature: { name: 'Signer', url: 'sig.png' } }
    );

    expect(data).toEqual(jasmine.objectContaining({
      letter_title: 'Welcome',
      letter_message: 'Hello',
      client_name: 'Client A',
      client_street: '2 Side Unit B',
      company_name: 'Acme',
      company_street: '1 Main',
      signed_by: 'Signer',
      signature_url: 'sig.png'
    }));
    expect(data.letter_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('creates safe slugs with a letter fallback', () => {
    expect((service as any).slug('Hello, World!')).toBe('hello-world');
    expect((service as any).slug('***')).toBe('letter');
  });
});
