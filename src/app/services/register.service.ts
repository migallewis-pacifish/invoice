import { inject, Injectable } from '@angular/core';
import { Auth, onAuthStateChanged, signOut } from '@angular/fire/auth';
import { Firestore, getDoc } from '@angular/fire/firestore';
import { RegisterPayload, RegisterWizardPayload } from '../models/invoice.model';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { addDoc, collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class RegisterService {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);

  async createCompanyForCurrentUser(data: Omit<RegisterWizardPayload, 'ownerEmail' | 'ownerPassword'>) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Not signed in');

    const companiesCol = collection(this.db, 'companies');
    const usersDoc = doc(this.db, `users/${user.uid}`);

    await runTransaction(this.db, async (tx) => {
      const compRef = await addDoc(companiesCol, {
        name: data.companyName,
        regNo: data.regNo ?? '',
        vatNo: data.vatNo ?? '',
        address: data.address ?? null,
        tel: data.tel ?? '',
        email: user.email ?? '',
        banking: data.banking ?? null,
        templatePath: null,
        users: [user.uid],
        pendingUsers: data.extraUserEmail ? [data.extraUserEmail] : [],
        createdAt: serverTimestamp()
      });

      tx.set(usersDoc, {
        uid: user.uid,
        email: user.email ?? '',
        companyId: compRef.id,
        role: 'owner',
        createdAt: serverTimestamp()
      });
    });
  }

  async routeAfterSignIn(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      await this.router.navigate(['/login']);
      return;
    }

    // Check Firestore user profile
    const userSnap = await getDoc(doc(this.db, `users/${user.uid}`));
    if (userSnap.exists() && userSnap.data()?.['companyId']) {
      await this.router.navigate(['/landing']);
    } else {
      await this.router.navigate(['/register-company']);
    }
    return;
  }

  /** Sign out completely */
  async logout() {
    await signOut(this.auth);
    this.router.navigate(['/login']);
  }

  /** Optional: watch auth changes (e.g. for navbar display) */
  watchUser(callback: (user: any) => void) {
    return onAuthStateChanged(this.auth, callback);
  }
}
