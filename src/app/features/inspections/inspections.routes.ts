import { Routes } from '@angular/router';

export const INSPECTIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./inspections.component').then((m) => m.InspectionsComponent),
    title: 'Inspections · Soteria',
  },
];
