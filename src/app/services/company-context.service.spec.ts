import { of } from 'rxjs';

import { CompanyContextService } from './company-context.service';

describe('CompanyContextService', () => {
  function configure(user: any, profile: any = null) {
    const service = Object.create(CompanyContextService.prototype) as CompanyContextService;
    spyOn(service, 'currentUser$').and.returnValue(of(user));
    spyOn(service, 'currentProfile$').and.returnValue(of(profile));
    return service;
  }

  it('returns the authenticated user company id', async () => {
    const service = configure(
      { uid: 'user-1', email: 'owner@example.com' },
      { email: 'owner@example.com', companyId: 'company-1', role: 'owner' }
    );

    await expectAsync(service.requireCompanyIdOnce()).toBeResolvedTo('company-1');
  });

  it('throws a not-authenticated error when no user is signed in', async () => {
    const service = configure(null);

    await expectAsync(service.requireCompanyIdOnce()).toBeRejectedWithError('Not authenticated');
  });

  it('throws a missing-company error when the profile has no company id', async () => {
    const service = configure(
      { uid: 'user-2', email: 'member@example.com' },
      { email: 'member@example.com', role: 'member' }
    );

    await expectAsync(service.requireCompanyIdOnce()).toBeRejectedWithError('User has no companyId');
  });
});
