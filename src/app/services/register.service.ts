import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { RegisterPayload, RegisterWizardPayload } from '../models/invoice.model';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { addDoc, collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class RegisterService {
  private auth = inject(Auth);
  private db = inject(Firestore);

  /**
   * Creates Auth owner user, company doc, and user profile.
   * Stores extraUserEmail in company.pendingUsers (invite flow later).
   */
  async registerCompanyAndOwner(data: RegisterWizardPayload) {
    // 1) Create owner auth user
    const cred = await createUserWithEmailAndPassword(this.auth, data.ownerEmail, data.ownerPassword);
    const uid = cred.user.uid;
    await updateProfile(cred.user, { displayName: data.companyName });

    // 2) Create company + user profile in a transaction
    const companiesCol = collection(this.db, 'companies');
    const usersDoc = doc(this.db, `users/${uid}`);

    await runTransaction(this.db, async (tx) => {
      // Create the company document
      const compRef = await addDoc(companiesCol, {
        name: data.companyName,
        regNo: data.regNo ?? '',
        vatNo: data.vatNo ?? '',
        address: data.address ?? null,
        tel: data.tel ?? '',
        email: data.ownerEmail,
        banking: data.banking ?? null,
        templatePath: null,
        users: [uid],
        pendingUsers: data.extraUserEmail ? [data.extraUserEmail] : [],
        createdAt: serverTimestamp()
      });

      // Owner profile
      tx.set(usersDoc, {
        uid,
        email: data.ownerEmail,
        companyId: compRef.id,
        role: 'owner',
        createdAt: serverTimestamp()
      });
    });

    return { uid };
  }
}
