import { inject, Injectable, InjectionToken } from '@angular/core';
import { Auth, authState, User } from '@angular/fire/auth';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { firstValueFrom, map, Observable, of, switchMap, take, throwError } from 'rxjs';
import { AppUser } from '../models/invoice.model';

export const CURRENT_AUTH_USER = new InjectionToken<Observable<User | null>>('CURRENT_AUTH_USER', {
  providedIn: 'root',
  factory: () => authState(inject(Auth))
});

export interface CompanyContext {
  user: User;
  profile: AppUser;
  companyId: string;
}

@Injectable({ providedIn: 'root' })
export class CompanyContextService {
  private readonly auth = inject(Auth);
  private readonly db = inject(Firestore);
  private readonly authUser$ = inject(CURRENT_AUTH_USER);

  currentUser$(): Observable<User | null> {
    return this.authUser$;
  }

  currentProfile$(): Observable<AppUser | null> {
    return this.currentUser$().pipe(
      switchMap(user => user ? docData(doc(this.db, `users/${user.uid}`)) as Observable<AppUser | undefined> : of(null)),
      map(profile => profile ?? null)
    );
  }

  currentCompanyId$(): Observable<string | null> {
    return this.currentProfile$().pipe(map(profile => profile?.companyId ?? null));
  }

  currentCompany$(): Observable<any | null> {
    return this.currentCompanyId$().pipe(
      switchMap(companyId => companyId ? docData(doc(this.db, `companies/${companyId}`)) : of(null)),
      map(company => company ?? null)
    );
  }

  currentContext$(): Observable<CompanyContext> {
    return this.currentUser$().pipe(
      take(1),
      switchMap(user => {
        if (!user) return throwError(() => new Error('Not authenticated'));
        return this.currentProfile$().pipe(
          take(1),
          map(profile => {
            if (!profile) throw new Error('User profile not found');
            if (!profile.companyId) throw new Error('User has no companyId');
            return { user, profile, companyId: profile.companyId };
          })
        );
      })
    );
  }

  async requireCompanyIdOnce(): Promise<string> {
    return (await firstValueFrom(this.currentContext$())).companyId;
  }
}
