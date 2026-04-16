import { Routes } from '@angular/router';

import { authGuard } from '@core/guards/auth.guard';
import { moduleGuard } from '@core/guards/module.guard';
import { AppShellComponent } from '@layouts/app-shell/app-shell.component';

/**
 * Top-level route table.
 *
 * Structure:
 *   /auth/*  → unauthenticated area (login, signup, password reset)
 *   /app/*   → authenticated shell (sidebar + topbar)
 *   /        → redirects to /app
 *
 * Each module mounts under `/app/<key>` via lazy-loaded child routes and is
 * gated by a per-module guard so disabled modules return to the dashboard.
 * Keeping `/app` as the authenticated parent leaves room for public marketing
 * pages at the root path later without restructuring anything.
 */
export const APP_ROUTES: Routes = [
  { path: '', redirectTo: 'app', pathMatch: 'full' },
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'app',
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
        path: 'equipment',
        canActivate: [moduleGuard('equipment_checks')],
        loadChildren: () =>
          import('./features/equipment/equipment.routes').then(
            (m) => m.EQUIPMENT_ROUTES,
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
      {
        path: 'incident-reports',
        canActivate: [moduleGuard('incidents')],
        loadChildren: () =>
          import('./features/incident-reports/incident-reports.routes').then(
            (m) => m.INCIDENT_REPORTS_ROUTES,
          ),
      },
      {
        path: 'training',
        canActivate: [moduleGuard('toolbox_talks')],
        loadChildren: () =>
          import('./features/training/training.routes').then(
            (m) => m.TRAINING_ROUTES,
          ),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then(
            (m) => m.SETTINGS_ROUTES,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'app' },
];
