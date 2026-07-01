import { inject, Injectable } from '@angular/core';
import { collectionData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { map, Observable } from 'rxjs';
import { CreateExpense, Expense } from '../models/expense.model';
import { ActivityService } from './activity.service';

@Injectable({
  providedIn: 'root'
})
export class ExpensesService {
  private readonly fs = inject(Firestore);
  private readonly activityService = inject(ActivityService);

  private getCollection(companyId: string) {
    return collection(this.fs, `companies/${companyId}/expenses`);
  }

  listAll(companyId: string): Observable<Expense[]> {
    const colRef = this.getCollection(companyId);
    const q = query(colRef, orderBy('date', 'desc'));

    return collectionData(q, { idField: 'id' }) as Observable<Expense[]>;
  }

  listByMonth(companyId: string, month: string): Observable<Expense[]> {
    const colRef = this.getCollection(companyId);

    const q = query(
      colRef,
      where('month', '==', month),
      orderBy('date', 'desc')
    );

    return collectionData(q, { idField: 'id' }) as Observable<Expense[]>;
  }

  listCompanyLevelByMonth(companyId: string, month: string): Observable<Expense[]> {
    return this.listByMonth(companyId, month).pipe(
      map(expenses => expenses.filter(expense => !expense.clientId))
    );
  }

  listByClientAndMonth(companyId: string, clientId: string, month: string): Observable<Expense[]> {
    return this.listByMonth(companyId, month).pipe(
      map(expenses => expenses.filter(expense => expense.clientId === clientId))
    );
  }

  listByClient(companyId: string, clientId: string): Observable<Expense[]> {
    const colRef = this.getCollection(companyId);
    const q = query(colRef, where('clientId', '==', clientId));

    return (collectionData(q, { idField: 'id' }) as Observable<Expense[]>).pipe(
      map(expenses => expenses.sort((a, b) => (b.date || '').localeCompare(a.date || '')))
    );
  }

  add(companyId: string, expense: CreateExpense) {
    const colRef = this.getCollection(companyId);

    return this.activityService.track(
      companyId,
      'create',
      `companies/${companyId}/expenses`,
      `Created expense ${expense.description || expense.category || 'record'}.`,
      () => addDoc(colRef, {
        ...expense,
        amount: Number(expense.amount),
        clientId: expense.clientId ?? null,
        createdAt: serverTimestamp()
      })
    );
  }

  remove(companyId: string, id: string) {
    return this.activityService.track(
      companyId,
      'delete',
      `companies/${companyId}/expenses/${id}`,
      `Deleted expense ${id}.`,
      () => deleteDoc(doc(this.fs, `companies/${companyId}/expenses/${id}`))
    );
  }
}
