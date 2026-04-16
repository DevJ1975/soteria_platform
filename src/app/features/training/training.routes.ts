import { Routes } from '@angular/router';

/**
 * Training feature routes. Mounted under `/app/training/*` by the
 * top-level APP_ROUTES; paths here are relative to that mount point.
 */
export const TRAINING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/training-sessions-list/training-sessions-list.component').then(
        (m) => m.TrainingSessionsListComponent,
      ),
    title: 'Toolbox Talks · Soteria',
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./pages/training-session-new/training-session-new.component').then(
        (m) => m.TrainingSessionNewComponent,
      ),
    title: 'New toolbox talk · Soteria',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/training-session-detail/training-session-detail.component').then(
        (m) => m.TrainingSessionDetailComponent,
      ),
    title: 'Toolbox talk · Soteria',
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/training-session-edit/training-session-edit.component').then(
        (m) => m.TrainingSessionEditComponent,
      ),
    title: 'Edit toolbox talk · Soteria',
  },
];
