import { inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, docData, getDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { map, of, switchMap, take } from 'rxjs';

export const companyGuard = async () => {
  const router = inject(Router);
  const auth = inject(Auth);
  const db = inject(Firestore);

  return authState(auth).pipe(
    take(1),
    switchMap(user => {
      if (!user) {
        router.navigate(['/login']);
        return of(false);
      }
      const uDoc = doc(db, `users/${user.uid}`);
      return docData(uDoc).pipe(
        take(1),
        map((u: any) => {
          if (u?.companyId) return true;
          router.navigate(['/register-company']);
          return false;
        })
      );
    })
  );
};