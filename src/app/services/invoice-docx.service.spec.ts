import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';

import { InvoiceDocxService } from './invoice-docx.service';
import { TemplateService } from './template.service';

describe('InvoiceDocxService', () => {
  let service: InvoiceDocxService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: {} },
        { provide: Firestore, useValue: {} },
        { provide: Storage, useValue: {} },
        { provide: TemplateService, useValue: { getDefaultTemplate: jasmine.createSpy('getDefaultTemplate') } }
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

  it('calculates invoice totals without VAT', () => {
    const totals = service.calculateInvoiceTotals([
      { description: 'Development', hours: '10', rate: '100' }
    ], false);

    expect(totals.subtotalStr).toBe('R 1,000.00');
    expect(totals.vatStr).toBe('R 0.00');
    expect(totals.grandStr).toBe('R 1,000.00');
  });
});
