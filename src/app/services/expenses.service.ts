import { inject, Injectable } from '@angular/core';
import { collectionData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { combineLatest, map, Observable, of } from 'rxjs';
import { CreateExpense, Expense } from '../models/expense.model';
import { ActivityService } from './activity.service';

@Injectable({
  providedIn: 'root'
})
export class ExpensesService {
  private readonly fs = inject(Firestore);
  private readonly activityService = inject(ActivityService);

  private getCompanyExpensesCollection(companyId: string) {
    return collection(this.fs, `companies/${companyId}/expenses`);
  }

  private getClientExpensesCollection(companyId: string, clientId: string) {
    return collection(this.fs, `companies/${companyId}/clients/${clientId}/expenses`);
  }

  listAll(companyId: string): Observable<Expense[]> {
    const colRef = this.getCompanyExpensesCollection(companyId);
    const q = query(colRef, orderBy('date', 'desc'));

    return (collectionData(q, { idField: 'id' }) as Observable<Expense[]>).pipe(
      map(expenses => filterCompanyLevelExpenses(expenses))
    );
  }

  listAllIncludingClients(companyId: string, clientIds: string[]): Observable<Expense[]> {
    const clientExpenses$ = clientIds.length
      ? combineLatest(clientIds.map(clientId => this.listByClient(companyId, clientId))).pipe(
          map(expenseGroups => expenseGroups.flat())
        )
      : of([] as Expense[]);

    return combineLatest([this.listAll(companyId), clientExpenses$]).pipe(
      map(([companyExpenses, clientExpenses]) => [...companyExpenses, ...clientExpenses])
    );
  }

  listByMonth(companyId: string, month: string): Observable<Expense[]> {
    const colRef = this.getCompanyExpensesCollection(companyId);

    const q = query(
      colRef,
      where('month', '==', month),
      orderBy('date', 'desc')
    );

    return collectionData(q, { idField: 'id' }) as Observable<Expense[]>;
  }

  listCompanyLevelByMonth(companyId: string, month: string): Observable<Expense[]> {
    const colRef = this.getCompanyExpensesCollection(companyId);
    const q = query(
      colRef,
      where('month', '==', month),
      orderBy('date', 'desc')
    );

    return (collectionData(q, { idField: 'id' }) as Observable<Expense[]>).pipe(
      map(expenses => filterCompanyLevelExpenses(expenses))
    );
  }

  listByClientAndMonth(companyId: string, clientId: string, month: string): Observable<Expense[]> {
    const clientColRef = this.getClientExpensesCollection(companyId, clientId);
    const clientQuery = query(
      clientColRef,
      where('month', '==', month),
      orderBy('date', 'desc')
    );
    const legacyQuery = query(
      this.getCompanyExpensesCollection(companyId),
      where('clientId', '==', clientId),
      where('month', '==', month),
      orderBy('date', 'desc')
    );

    return combineLatest([
      collectionData(clientQuery, { idField: 'id' }) as Observable<Expense[]>,
      collectionData(legacyQuery, { idField: 'id' }) as Observable<Expense[]>
    ]).pipe(
      map(([clientExpenses, legacyExpenses]) => mergeClientExpenseLists(clientExpenses, legacyExpenses))
    );
  }

  listByClient(companyId: string, clientId: string): Observable<Expense[]> {
    const clientQuery = query(this.getClientExpensesCollection(companyId, clientId), orderBy('date', 'desc'));
    const legacyQuery = query(this.getCompanyExpensesCollection(companyId), where('clientId', '==', clientId));

    return combineLatest([
      collectionData(clientQuery, { idField: 'id' }) as Observable<Expense[]>,
      collectionData(legacyQuery, { idField: 'id' }) as Observable<Expense[]>
    ]).pipe(
      map(([clientExpenses, legacyExpenses]) => mergeClientExpenseLists(clientExpenses, legacyExpenses))
    );
  }

  add(companyId: string, expense: CreateExpense) {
    const clientId = expense.clientId ?? null;
    const colRef = clientId
      ? this.getClientExpensesCollection(companyId, clientId)
      : this.getCompanyExpensesCollection(companyId);
    const path = clientId
      ? `companies/${companyId}/clients/${clientId}/expenses`
      : `companies/${companyId}/expenses`;
    const { clientId: _clientId, ...expenseData } = expense;

    return this.activityService.track(
      companyId,
      'create',
      path,
      `Created expense ${expense.description || expense.category || 'record'}.`,
      () => addDoc(colRef, {
        ...expenseData,
        amount: Number(expense.amount),
        ...(clientId ? { clientId } : {}),
        createdAt: serverTimestamp()
      })
    );
  }

  remove(companyId: string, id: string, clientId?: string | null, source?: Expense['source']) {
    const path = source === 'client' && clientId
      ? `companies/${companyId}/clients/${clientId}/expenses/${id}`
      : `companies/${companyId}/expenses/${id}`;

    return this.activityService.track(
      companyId,
      'delete',
      path,
      `Deleted expense ${id}.`,
      () => deleteDoc(doc(this.fs, path))
    );
  }

}

export function filterCompanyLevelExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter(expense => !expense.clientId);
}

export function mergeClientExpenseLists(clientExpenses: Expense[], legacyExpenses: Expense[]): Expense[] {
  return sortByDateDesc([
    ...clientExpenses.map(expense => withSource(expense, 'client')),
    ...legacyExpenses.map(expense => withSource(expense, 'legacyCompanyClient'))
  ]);
}

function withSource(expense: Expense, source: NonNullable<Expense['source']>): Expense {
  return { ...expense, source };
}

function sortByDateDesc(expenses: Expense[]): Expense[] {
  return expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
