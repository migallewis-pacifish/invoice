import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';

import { InvoiceDocxService } from './invoice-docx.service';
import { TemplateService } from './template.service';
import { NotificationService } from './notification.service';
import { of, throwError } from 'rxjs';
import { DocumentStorageService } from './document-storage.service';
import { PdfGenerationService } from './pdf-generation.service';

describe('InvoiceDocxService', () => {
  let service: InvoiceDocxService;
  let notifications: jasmine.SpyObj<NotificationService>;
  let documentStorage: jasmine.SpyObj<DocumentStorageService>;

  beforeEach(() => {
    notifications = jasmine.createSpyObj<NotificationService>('NotificationService', ['error', 'success']);
    documentStorage = jasmine.createSpyObj<DocumentStorageService>('DocumentStorageService', ['saveGeneratedDocument']);

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: {} },
        { provide: Firestore, useValue: {} },
        { provide: Storage, useValue: {} },
        { provide: TemplateService, useValue: { getDefaultTemplate: jasmine.createSpy('getDefaultTemplate') } },
        { provide: NotificationService, useValue: notifications },
        { provide: DocumentStorageService, useValue: documentStorage },
        { provide: PdfGenerationService, useValue: { generate: jasmine.createSpy('generate') } }
      ]
    });
    service = TestBed.inject(InvoiceDocxService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('calculates invoice totals with VAT', () => {
    const totals = service.calculateInvoiceTotals([
      { description: 'Development', hours: '10', rate: '100' },
      { description: 'Support', hours: '2.5', rate: '200' }
    ], true);

    expect(totals.items.map(item => item.amount)).toEqual(['R 1,000.00', 'R 500.00']);
    expect(totals.subtotalStr).toBe('R 1,500.00');
    expect(totals.vatStr).toBe('R 225.00');
    expect(totals.grandStr).toBe('R 1,725.00');
  });

  it('uses the selected currency symbol for invoice totals', () => {
    const totals = service.calculateInvoiceTotals([
      { description: 'Development', hours: '10', rate: '100' }
    ], false, 'USD');

    expect(totals.subtotalStr).toBe('$ 1,000.00');
    expect(totals.vatStr).toBe('$ 0.00');
    expect(totals.grandStr).toBe('$ 1,000.00');
  });

  it('returns a clear user-facing message and records diagnostic details when invoice generation fails', (done) => {
    const diagnosticError = new Error('Docxtemplater parse failed at placeholder client_name');
    spyOn<any>(service, 'generateInvoiceDocx').and.returnValue(throwError(() => diagnosticError));

    service.generateAndSave('company-a', {
      invoice_number: 'INV-001',
      invoice_date: '2026-07-09',
      client_name: 'Client A',
      client_building: '',
      client_street: '',
      client_suburb: '',
      client_city: '',
      client_postal_code: '',
      client_contact_no: '',
      services_rendered: '',
      client_email: '',
      notes: '',
      reference: '',
      items: []
    }).subscribe({
      next: () => done.fail('Expected invoice generation to fail.'),
      error: err => {
        expect(err.message).toBe(InvoiceDocxService.GENERATE_INVOICE_ERROR_MESSAGE);
        expect(notifications.error).toHaveBeenCalledWith(
          InvoiceDocxService.GENERATE_INVOICE_ERROR_MESSAGE,
          diagnosticError
        );
        done();
      }
    });
  });


  it('routes generated invoice documents through document storage service', (done) => {
    const blob = new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    spyOn<any>(service, 'generateInvoiceDocx').and.returnValue(of({ blob, company: {} as any, fileName: 'INV-002.docx' }));
    documentStorage.saveGeneratedDocument.and.resolveTo({ provider: 'google_drive', fileName: 'INV-002.docx', uploaded: true, fallback: false });

    service.generateAndSave('company-a', {
      invoice_number: 'INV-002', invoice_date: '2026-07-23', client_name: 'Client B', client_building: '', client_street: '', client_suburb: '', client_city: '', client_postal_code: '', client_contact_no: '', services_rendered: '', client_email: '', notes: '', reference: '', items: []
    }).subscribe(result => {
      expect(result).toBe('INV-002.docx');
      expect(documentStorage.saveGeneratedDocument).toHaveBeenCalledWith(jasmine.objectContaining({ companyId: 'company-a', clientName: 'Client B', documentType: 'invoice', documentId: 'INV-002', fileName: 'INV-002.docx', blob }));
      done();
    });
  });

  it('calculates invoice totals without VAT', () => {
    const totals = service.calculateInvoiceTotals([
      { description: 'Development', hours: '10', rate: '100' }
    ], false);

    expect(totals.subtotalStr).toBe('R 1,000.00');
    expect(totals.vatStr).toBe('R 0.00');
    expect(totals.grandStr).toBe('R 1,000.00');
  });
});
