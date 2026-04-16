import { Routes } from '@angular/router';

import { roleGuard } from '@core/guards/role.guard';

/**
 * Settings feature routes. Mounted under `/app/settings/*` by the
 * top-level APP_ROUTES; paths here are relative.
 *
 * All settings pages are admin-only — the `roleGuard('admin')` in each
 * entry (plus platform_admin as the implicit higher role) keeps workers
 * and supervisors out. Unauthorized users get redirected to the
 * dashboard.
 */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'modules',
    pathMatch: 'full',
  },
  {
    path: 'modules',
    canActivate: [roleGuard('admin')],
    loadComponent: () =>
      import('./pages/tenant-modules/tenant-modules.component').then(
        (m) => m.TenantModulesComponent,
      ),
    title: 'Modules & Plan · Soteria',
  },
];
