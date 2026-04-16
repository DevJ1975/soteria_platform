import { Routes } from '@angular/router';

/**
 * Corrective Actions feature routes. Mounted under
 * `/app/corrective-actions/*` by the top-level APP_ROUTES; paths here are
 * relative to that mount point.
 */
export const CORRECTIVE_ACTIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/corrective-actions-list/corrective-actions-list.component').then(
        (m) => m.CorrectiveActionsListComponent,
      ),
    title: 'Corrective actions · Soteria',
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./pages/corrective-action-new/corrective-action-new.component').then(
        (m) => m.CorrectiveActionNewComponent,
      ),
    title: 'New corrective action · Soteria',
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/corrective-action-edit/corrective-action-edit.component').then(
        (m) => m.CorrectiveActionEditComponent,
      ),
    title: 'Edit corrective action · Soteria',
  },
];
