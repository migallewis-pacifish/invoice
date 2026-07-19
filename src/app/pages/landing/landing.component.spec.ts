import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LandingComponent } from './landing.component';
import { Firestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CurrencyService } from '../../services/currency.service';
import { ClientService } from '../../services/client.service';
import { ExpensesService } from '../../services/expenses.service';
import { ActivityService } from '../../services/activity.service';
import { CompanyContextService } from '../../services/company-context.service';
import { throwError } from 'rxjs';

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent]
      , providers: [
        { provide: Firestore, useValue: {} },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: Dialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: CurrencyService, useValue: { defaultCurrency: 'ZAR', symbolFor: () => 'R', normalize: () => 'ZAR' } },
        { provide: ClientService, useValue: {} },
        { provide: ExpensesService, useValue: {} },
        { provide: ActivityService, useValue: {} },
        { provide: CompanyContextService, useValue: { currentContext$: () => throwError(() => new Error('Not authenticated')) } }
      ]
    })
    .overrideComponent(LandingComponent, { set: { template: '' } })
    .compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
