import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Client } from '../models/invoice.model';

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
}
