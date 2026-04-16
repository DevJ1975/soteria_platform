import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Gate for `/platform-admin/**`. Only lets users with
 * `role = 'platform_admin'` through; everyone else is redirected to
 * their tenant dashboard.
 *
 * Pairs with `authGuard` — the outer shell already ensures the user is
 * signed in and the profile is loaded before this guard runs.
 */
export const platformAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenInitialized();

  if (auth.isPlatformAdmin()) return true;
  return router.createUrlTree(['/app/dashboard']);
};
