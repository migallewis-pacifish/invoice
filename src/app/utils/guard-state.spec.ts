import { resolveAuthGuardTarget, resolveCompanyGuardTarget } from './guard-state';

describe('guard state resolution', () => {
  const user = { uid: 'user-1' };

  it('allows authenticated users through the auth guard', () => {
    expect(resolveAuthGuardTarget(user)).toBeTrue();
  });

  it('redirects unauthenticated users to login', () => {
    expect(resolveAuthGuardTarget(null)).toBe('/login');
    expect(resolveCompanyGuardTarget(null, 'company-a')).toBe('/login');
  });

  it('allows authenticated users with a company through the company guard', () => {
    expect(resolveCompanyGuardTarget(user, 'company-a')).toBeTrue();
  });

  it('redirects authenticated users without a company to registration', () => {
    expect(resolveCompanyGuardTarget(user, null)).toBe('/register');
    expect(resolveCompanyGuardTarget(user, undefined)).toBe('/register');
  });
});
