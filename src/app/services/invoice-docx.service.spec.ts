import { TestBed } from '@angular/core/testing';

import { InvoiceDocxService } from './invoice-docx.service';

describe('InvoiceDocxService', () => {
  let service: InvoiceDocxService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InvoiceDocxService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
