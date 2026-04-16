import { Routes } from '@angular/router';

import { authGuard } from '@core/guards/auth.guard';
import { moduleGuard } from '@core/guards/module.guard';
import { AppShellComponent } from '@layouts/app-shell/app-shell.component';

/**
 * Top-level route table.
 *
 * Structure:
 *   /auth/*        → unauthenticated area (login, signup, etc.)
 *   everything else → authenticated shell with sidebar + topbar
 *
 * Each module mounts under the shell via lazy-loaded child routes and is
 * gated by a per-module guard so disabled modules return to the dashboard.
 */
export const APP_ROUTES: Routes = [
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(
            (m) => m.DASHBOARD_ROUTES,
          ),
      },
      {
        path: 'inspections',
        canActivate: [moduleGuard('inspections')],
        loadChildren: () =>
          import('./features/inspections/inspections.routes').then(
            (m) => m.INSPECTIONS_ROUTES,
          ),
      },
      {
        path: 'equipment-checks',
        canActivate: [moduleGuard('equipment_checks')],
        loadChildren: () =>
          import('./features/equipment-checks/equipment-checks.routes').then(
            (m) => m.EQUIPMENT_CHECKS_ROUTES,
          ),
      },
      {
        path: 'corrective-actions',
        canActivate: [moduleGuard('corrective_actions')],
        loadChildren: () =>
          import('./features/corrective-actions/corrective-actions.routes').then(
            (m) => m.CORRECTIVE_ACTIONS_ROUTES,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
