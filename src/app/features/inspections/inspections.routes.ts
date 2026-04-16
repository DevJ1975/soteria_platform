import { Routes } from '@angular/router';

/**
 * Inspections feature routes. Mounted under `/app/inspections/*` by the
 * top-level APP_ROUTES; the paths here are relative to that mount point.
 */
export const INSPECTIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/inspections-list/inspections-list.component').then(
        (m) => m.InspectionsListComponent,
      ),
    title: 'Inspections · Soteria',
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./pages/inspection-new/inspection-new.component').then(
        (m) => m.InspectionNewComponent,
      ),
    title: 'New inspection · Soteria',
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/inspection-edit/inspection-edit.component').then(
        (m) => m.InspectionEditComponent,
      ),
    title: 'Edit inspection · Soteria',
  },
];
