import { Routes } from '@angular/router';

export const CORRECTIVE_ACTIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./corrective-actions.component').then((m) => m.CorrectiveActionsComponent),
    title: 'Corrective Actions · Soteria',
  },
];
