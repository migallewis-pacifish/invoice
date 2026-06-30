import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { map, take } from 'rxjs/operators';
import { resolveAuthGuardTarget } from './guard-state';

export const authGuard = () => {
  const router = inject(Router);
  const auth = inject(Auth);

  return authState(auth).pipe(
    take(1),
    map(user => {
      const target = resolveAuthGuardTarget(user);
      if (target === true) return true;
      router.navigate([target]);
      return false;
    })
  );
};