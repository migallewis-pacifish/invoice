import { inject, Injectable } from '@angular/core';
import { collectionData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { CreateExpense, Expense } from '../models/expense.model';

@Injectable({
  providedIn: 'root'
})
export class ExpensesService {
  private readonly fs = inject(Firestore);

  private getCollection(companyId: string) {
    return collection(this.fs, `companies/${companyId}/expenses`);
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

  add(companyId: string, expense: CreateExpense) {
    const colRef = this.getCollection(companyId);

    return addDoc(colRef, {
      ...expense,
      amount: Number(expense.amount),
      clientId: expense.clientId ?? null,
      createdAt: serverTimestamp()
    });
  }

  remove(companyId: string, id: string) {
    return deleteDoc(doc(this.fs, `companies/${companyId}/expenses/${id}`));
  }
}
