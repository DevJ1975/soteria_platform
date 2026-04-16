import { Routes } from '@angular/router';

/**
 * Incident reports feature routes. Mounted under
 * `/app/incident-reports/*` by the top-level APP_ROUTES; paths here are
 * relative to that mount point.
 */
export const INCIDENT_REPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/incident-reports-list/incident-reports-list.component').then(
        (m) => m.IncidentReportsListComponent,
      ),
    title: 'Incident reports · Soteria',
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./pages/incident-report-new/incident-report-new.component').then(
        (m) => m.IncidentReportNewComponent,
      ),
    title: 'New incident report · Soteria',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/incident-report-detail/incident-report-detail.component').then(
        (m) => m.IncidentReportDetailComponent,
      ),
    title: 'Incident report · Soteria',
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/incident-report-edit/incident-report-edit.component').then(
        (m) => m.IncidentReportEditComponent,
      ),
    title: 'Edit incident report · Soteria',
  },
];
