import { Routes } from '@angular/router';

/**
 * Child routes for the platform admin area. Mounted in `app.routes.ts`
 * at `/platform-admin` under the `PlatformAdminShellComponent`, guarded
 * by `authGuard + platformAdminGuard`.
 */
export const PLATFORM_ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.PlatformAdminDashboardComponent,
      ),
  },
  {
    path: 'tenants',
    loadComponent: () =>
      import('./pages/tenants-list/tenants-list.component').then(
        (m) => m.PlatformAdminTenantsListComponent,
      ),
  },
  {
    path: 'tenants/new',
    loadComponent: () =>
      import('./pages/tenant-new/tenant-new.component').then(
        (m) => m.PlatformAdminTenantNewComponent,
      ),
  },
  {
    path: 'tenants/:id/edit',
    loadComponent: () =>
      import('./pages/tenant-edit/tenant-edit.component').then(
        (m) => m.PlatformAdminTenantEditComponent,
      ),
  },
  {
    path: 'plans',
    loadComponent: () =>
      import('./pages/plans-list/plans-list.component').then(
        (m) => m.PlatformAdminPlansListComponent,
      ),
  },
  {
    path: 'modules',
    loadComponent: () =>
      import('./pages/modules-list/modules-list.component').then(
        (m) => m.PlatformAdminModulesListComponent,
      ),
  },
];
