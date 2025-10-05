import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterWizardComponent } from './register-wizard.component';

describe('RegisterWizardComponent', () => {
  let component: RegisterWizardComponent;
  let fixture: ComponentFixture<RegisterWizardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterWizardComponent]
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
