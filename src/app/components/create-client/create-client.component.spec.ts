import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateClientComponent } from './create-client.component';
import { ClientService } from '../../services/client.service';

describe('CreateClientComponent', () => {
  let component: CreateClientComponent;
  let fixture: ComponentFixture<CreateClientComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateClientComponent]
      , providers: [{ provide: ClientService, useValue: {} }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateClientComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires person names, phone number, type, and status', () => {
    component.form.setValue({
      clientType: 'client',
      title: 'Dr',
      firstName: 'Amina',
      lastName: 'Patel',
      companyName: '',
      building: '',
      line1: '',
      line2: '',
      suburb: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      email: '',
      phone: '+27 11 555 0100',
      vatNo: '',
      relationshipType: '',
      status: 'active',
      notes: ''
    });

    expect(component.form.valid).toBeTrue();

    component.form.patchValue({ phone: '' });
    expect(component.form.controls.phone.hasError('required')).toBeTrue();
  });

  it('requires a company name instead of person names for companies', () => {
    component.form.patchValue({
      clientType: 'company',
      companyName: 'Acme Holdings',
      firstName: '',
      lastName: '',
      phone: '+27 11 555 0100'
    });

    expect(component.isCompany).toBeTrue();
    expect(component.form.valid).toBeTrue();
  });

  it('populates and preserves the title when editing', () => {
    component.client = {
      id: 'client-1',
      clientType: 'client',
      title: 'Ms',
      firstName: 'A',
      lastName: 'Other',
      displayName: 'A N Other',
      address: { building: 'North Tower' },
      phone: '+27 11 555 0100',
      createdAt: 1
    };

    component.ngOnChanges({ client: { currentValue: component.client, previousValue: null, firstChange: true, isFirstChange: () => true } });

    expect(component.form.controls.title.value).toBe('Ms');
    expect(component.form.controls.building.value).toBe('North Tower');
  });
});
