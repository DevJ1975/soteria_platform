import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Blocks protected routes until the initial session-restore has finished,
 * then lets the route through only if a Supabase session exists.
 *
 * Note: we intentionally check for a session (not an app profile). A user
 * who has just signed in but whose `user_profiles` row hasn't loaded yet
 * should still enter the shell — components can render their own loading
 * state for profile-dependent UI instead of bouncing the user to /login.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenInitialized();

  if (auth.isSignedIn()) {
    return true;
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * Inverse of {@link authGuard}: only lets the route through when the user
 * is signed out. Keeps authenticated users from landing on /auth/login via
 * the back button.
 */
export const publicOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenInitialized();

  return auth.isSignedIn() ? router.createUrlTree(['/app']) : true;
};
