import { Routes } from '@angular/router';

export const EQUIPMENT_CHECKS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./equipment-checks.component').then((m) => m.EquipmentChecksComponent),
    title: 'Equipment Checks · Soteria',
  },
];
