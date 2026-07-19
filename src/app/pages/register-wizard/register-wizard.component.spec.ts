import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterWizardComponent } from './register-wizard.component';
import { RegisterService } from '../../services/register.service';
import { Router } from '@angular/router';

describe('RegisterWizardComponent', () => {
  let component: RegisterWizardComponent;
  let fixture: ComponentFixture<RegisterWizardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterWizardComponent]
      , providers: [
        { provide: RegisterService, useValue: { createCompanyForCurrentUser: jasmine.createSpy('createCompanyForCurrentUser') } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
