import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { SubscriptionService } from '../services/subscription.service';

/**
 * Blocks module routes when the tenant's subscription no longer grants
 * access (expired trial, fully-canceled, inactive). Always lets
 * platform admins through — they need to be able to reach a tenant's
 * screens regardless of its billing state to triage.
 *
 * What stays accessible even when this guard blocks
 * -------------------------------------------------
 * Deliberately *not* applied to:
 *   - `/app/dashboard` (the redirect target)
 *   - `/app/billing`   (how the user fixes the problem)
 *   - `/app/settings`  (payment/contact info lives there eventually)
 * Applying everywhere would trap users on the redirect target with no
 * way to open the billing page.
 */
export const billingAccessGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const subs = inject(SubscriptionService);
  const router = inject(Router);

  await auth.whenInitialized();

  // Platform admins bypass billing — they need to support customers
  // whose billing is broken.
  if (auth.isPlatformAdmin()) return true;

  // Lazy-load the subscription if the service hasn't been touched yet
  // (guard can fire before any component has invoked refresh()).
  if (!subs.loaded()) {
    try {
      await subs.refresh();
    } catch (err) {
      // Fail open rather than locking the tenant out on an incidental
      // DB hiccup — the billing page will surface the error the next
      // time it loads. Log so the failure is visible in devtools /
      // future observability sinks instead of silently hidden.
      // eslint-disable-next-line no-console
      console.error(
        '[billingAccessGuard] Subscription refresh failed; failing open.',
        err,
      );
      return true;
    }
  }

  if (subs.hasAccess()) return true;
  return router.createUrlTree(['/app/billing']);
};
