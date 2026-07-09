import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import * as AuthFns from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import * as FirestoreFns from '@angular/fire/firestore';
import { of } from 'rxjs';

import { CompanyContextService } from './company-context.service';

describe('CompanyContextService', () => {
  let docDataSpy: jasmine.Spy;

  function configure(user: any, profiles: Record<string, any> = {}, companies: Record<string, any> = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: {} },
        { provide: Firestore, useValue: {} }
      ]
    });

    spyOn(AuthFns, 'authState').and.returnValue(of(user));
    spyOn(FirestoreFns, 'doc').and.callFake(((_db: any, path?: string) => ({ path })) as any);
    docDataSpy = spyOn(FirestoreFns, 'docData').and.callFake((ref: any) => {
      if (ref.path.startsWith('users/')) return of(profiles[ref.path]);
      if (ref.path.startsWith('companies/')) return of(companies[ref.path]);
      return of(undefined);
    });

    return TestBed.inject(CompanyContextService);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('returns the authenticated user company id and company document', async () => {
    const service = configure(
      { uid: 'user-1', email: 'owner@example.com' },
      { 'users/user-1': { email: 'owner@example.com', companyId: 'company-1', role: 'owner' } },
      { 'companies/company-1': { name: 'Acme' } }
    );

    await expectAsync(service.requireCompanyIdOnce()).toBeResolvedTo('company-1');

    service.currentCompany$().subscribe(company => {
      expect(company).toEqual({ name: 'Acme' });
    });
    expect(docDataSpy).toHaveBeenCalled();
  });

  it('throws a not-authenticated error when no user is signed in', async () => {
    const service = configure(null);

    await expectAsync(service.requireCompanyIdOnce()).toBeRejectedWithError('Not authenticated');
  });

  it('throws a missing-company error when the profile has no company id', async () => {
    const service = configure(
      { uid: 'user-2', email: 'member@example.com' },
      { 'users/user-2': { email: 'member@example.com', role: 'member' } }
    );

    await expectAsync(service.requireCompanyIdOnce()).toBeRejectedWithError('User has no companyId');
  });
});
