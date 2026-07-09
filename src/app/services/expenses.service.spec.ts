import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';

import { Expense } from '../models/expense.model';
import { ActivityService } from './activity.service';
import { ExpensesService, filterCompanyLevelExpenses, mergeClientExpenseLists } from './expenses.service';

describe('ExpensesService', () => {
  let service: ExpensesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: ActivityService, useValue: { track: (_companyId: string, _action: string, _path: string, _message: string, work: () => unknown) => work() } }
      ]
    });
    service = TestBed.inject(ExpensesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('filters company-level expense listings to records without a clientId', () => {
    const expenses = [
      { id: 'company-expense', date: '2026-07-02', month: '2026-07', description: 'Rent', category: 'Rent', amount: 1000 },
      { id: 'legacy-client-expense', date: '2026-07-03', month: '2026-07', description: 'Client travel', category: 'Fuel / Travel', amount: 100, clientId: 'client-1' }
    ] satisfies Expense[];

    expect(filterCompanyLevelExpenses(expenses)).toEqual([expenses[0]]);
  });

  it('merges client subcollection listings with legacy client-linked company expenses', () => {
    const migratedExpense = { id: 'new-client-expense', date: '2026-07-04', month: '2026-07', description: 'Onsite work', category: 'Fuel / Travel', amount: 150, clientId: 'client-1' } satisfies Expense;
    const legacyExpense = { id: 'legacy-client-expense', date: '2026-07-01', month: '2026-07', description: 'Legacy onsite work', category: 'Fuel / Travel', amount: 75, clientId: 'client-1' } satisfies Expense;

    expect(mergeClientExpenseLists([migratedExpense], [legacyExpense])).toEqual([
      { ...migratedExpense, source: 'client' },
      { ...legacyExpense, source: 'legacyCompanyClient' }
    ]);
  });
});
