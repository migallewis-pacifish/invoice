import { inject, Injectable } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { collectionData, docData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, doc, getDoc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { Client } from '../models/invoice.model';
import { defer, from, map, Observable, of, switchMap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ClientService {

  private auth = inject(Auth);
  private db = inject(Firestore);

  /** Reads companyId from users/{uid} */
  private companyContext$(): Observable<{ userId: string; companyId: string }> {
    return defer(() => {
      const user = this.auth.currentUser;
      if (!user) {
        return throwError(() => new Error('Not authenticated'));
      }
      const userDoc = doc(this.db, `users/${user.uid}`);
      return from(getDoc(userDoc)).pipe(
        map(snap => {
          if (!snap.exists()) throw new Error('User profile not found');
          const data = snap.data() as any;
          const companyId = data?.companyId as string | undefined;
          if (!companyId) throw new Error('User has no companyId');
          return { userId: user.uid, companyId };
        })
      );
    });
  }

  private getCompanyId$(): Observable<string> {
    return this.companyContext$().pipe(map(ctx => ctx.companyId));
  }

  getClientById(id: string): Observable<any | null> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => from(getDoc(doc(this.db, `companies/${companyId}/clients/${id}`)))),
      map(snap => (snap.exists() ? { id: snap.id, ...snap.data() } : null))
    );
  }

  /** 🔹 Get invoices for a client (live) */
  getInvoicesForClient(id: string): Observable<any[]> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const ref = collection(this.db, `companies/${companyId}/clients/${id}/invoices`);
        const q = query(ref, orderBy('date', 'desc'));
        return collectionData(q, { idField: 'id' }).pipe(
          map((arr: any[] | undefined) => arr ?? [])
        );
      })
    );
    // return of([]);
  }

  createInvoice(clientId: string, data: any): Observable<string> {
    console.log('creating invoice for client:', clientId);
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const colRef = collection(this.db, `companies/${companyId}/clients/${clientId}/invoices`);
        return from(addDoc(colRef, data)).pipe(map(ref => ref.id));
      })
    );
  }

  /** Creates a client under companies/{companyId}/clients */
  createClient(payload: Omit<Client, 'id' | 'createdAt' | 'createdBy'>): Observable<string> {
    return this.companyContext$().pipe(
      switchMap(({ userId, companyId }) => {
        const colRef = collection(this.db, `companies/${companyId}/clients`);
        return from(
          addDoc(colRef, {
            ...payload,
            createdAt: serverTimestamp(),
            createdBy: userId,
          })
        ).pipe(map(docRef => docRef.id));
      })
    );
  }

  clients$(): Observable<Client[]> {
    return authState(this.auth).pipe(
      switchMap(user => {
        if (!user) return of([]);
        const userDoc = doc(this.db, `users/${user.uid}`);
        return docData(userDoc).pipe(
          switchMap((u: any) => {
            const companyId = u?.companyId as string | undefined;
            if (!companyId) return of([]);
            const col = collection(this.db, `companies/${companyId}/clients`);
            const q = query(col, orderBy('displayName'));
            return collectionData(q, { idField: 'id' }).pipe(
              map((arr: any[]) =>
                arr.map(x => ({
                  ...x,
                  createdAt: typeof x.createdAt?.toMillis === 'function' ? x.createdAt.toMillis() : x.createdAt ?? 0
                })) as Client[]
              )
            );
          })
        );
      })
    );
  }
}
