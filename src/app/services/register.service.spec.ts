import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';

import { RegisterService } from './register.service';

describe('RegisterService', () => {
  let navigateSpy: jasmine.Spy;

  function configure(currentUser: unknown) {
    navigateSpy = jasmine.createSpy('navigate').and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { currentUser } },
        { provide: Firestore, useValue: {} },
        { provide: Router, useValue: { navigate: navigateSpy } }
      ]
    });
    return TestBed.inject(RegisterService);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('should be created', () => {
    expect(configure({ uid: 'user-1', email: 'owner@example.com' })).toBeTruthy();
  });

  it('throws a company context error when creating a company while unauthenticated', async () => {
    const service = configure(null);

    await expectAsync(service.createCompanyForCurrentUser({ companyName: 'Acme', address: {}, tel: '' }))
      .toBeRejectedWithError('Not signed in');
  });

  it('routes unauthenticated users to login', async () => {
    const service = configure(null);

    await service.routeAfterSignIn();

    expect(navigateSpy).toHaveBeenCalledOnceWith(['/login']);
  });
});
