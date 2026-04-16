import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ModuleKey } from '../models';
import { ModuleRegistryService } from '../services/module-registry.service';

/**
 * Higher-order guard: given a module key, returns a CanActivateFn that
 * only allows the route through if that module is enabled for the current
 * tenant. Use in route configs like:
 *
 *   {
 *     path: 'inspections',
 *     canActivate: [authGuard, moduleGuard('inspections')],
 *     loadChildren: () => import('...'),
 *   }
 */
export function moduleGuard(moduleKey: ModuleKey): CanActivateFn {
  return () => {
    const registry = inject(ModuleRegistryService);
    const router = inject(Router);

    if (registry.isEnabled(moduleKey)) {
      return true;
    }

    // Sending users back to the dashboard is the least jarring fallback
    // when a module is disabled. A dedicated "this module is not enabled
    // for your organization" landing page can replace this later.
    return router.createUrlTree(['/app/dashboard']);
  };
}
