import { inject, Injectable } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { collectionData, docData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, doc, getDoc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { Client } from '../models/invoice.model';
import { map, Observable, of, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ClientService {

  private auth = inject(Auth);
  private db = inject(Firestore);

  /** Reads companyId from users/{uid} */
  private async getCompanyId(): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const snap = await getDoc(doc(this.db, `users/${user.uid}`));
    if (!snap.exists()) throw new Error('User profile not found');
    const data = snap.data() as any;
    if (!data.companyId) throw new Error('User has no companyId');
    return data.companyId as string;
  }

  /** Creates a client under companies/{companyId}/clients */
  async createClient(payload: Omit<Client, 'id' | 'createdAt' | 'createdBy'>): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const companyId = await this.getCompanyId();

    const colRef = collection(this.db, `companies/${companyId}/clients`);
    const docRef = await addDoc(colRef, {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });

    return docRef.id;
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
