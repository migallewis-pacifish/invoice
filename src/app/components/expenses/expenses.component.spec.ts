import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpensesComponent } from './expenses.component';
import { ExpensesService } from '../../services/expenses.service';
import { ClientService } from '../../services/client.service';
import { Firestore } from '@angular/fire/firestore';
import { CurrencyService } from '../../services/currency.service';
import { of } from 'rxjs';

describe('ExpensesComponent', () => {
  let component: ExpensesComponent;
  let fixture: ComponentFixture<ExpensesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpensesComponent]
      , providers: [
        { provide: ExpensesService, useValue: { listByClientAndMonth: () => of([]), listCompanyLevelByMonth: () => of([]) } },
        { provide: ClientService, useValue: { clients$: () => of([]) } },
        { provide: Firestore, useValue: {} },
        { provide: CurrencyService, useValue: { defaultCurrency: 'ZAR', symbolFor: () => 'R', normalize: () => 'ZAR', format: (value: number) => `R${value}` } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExpensesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
