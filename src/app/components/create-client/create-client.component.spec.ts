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

  it('requires only the client name, phone number, and status', () => {
    component.form.setValue({
      displayName: 'Acme',
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
});
