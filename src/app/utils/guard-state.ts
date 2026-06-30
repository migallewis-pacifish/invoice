export type GuardTarget = true | '/login' | '/register-company';

export function resolveAuthGuardTarget(user: unknown): GuardTarget {
  return user ? true : '/login';
}

export function resolveCompanyGuardTarget(user: unknown, companyId?: string | null): GuardTarget {
  if (!user) return '/login';
  return companyId ? true : '/register-company';
}
