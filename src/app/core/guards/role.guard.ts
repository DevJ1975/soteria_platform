import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from '../models';
import { AuthService } from '../services/auth.service';

/**
 * Higher-order guard: given one or more roles, returns a CanActivateFn
 * that only lets the user through if their profile role is in the list.
 *
 * Usage:
 *   { path: 'settings', canActivate: [authGuard, roleGuard('admin')] }
 *
 * Unauthorized users are redirected to `/app/dashboard` (the safest
 * default — the dashboard always exists and is always accessible to
 * signed-in users). A dedicated "you don't have access to this" page
 * can replace the redirect later if the UX calls for it.
 *
 * `platform_admin` is always implicitly allowed — platform staff can
 * reach any admin surface.
 */
export function roleGuard(...allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const role = auth.profile()?.role;
    if (!role) return router.createUrlTree(['/app/dashboard']);

    const allowed = role === 'platform_admin' || allowedRoles.includes(role);
    return allowed ? true : router.createUrlTree(['/app/dashboard']);
  };
}
