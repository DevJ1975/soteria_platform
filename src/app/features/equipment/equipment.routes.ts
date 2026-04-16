import { Routes } from '@angular/router';

/**
 * Equipment feature routes. Mounted under `/app/equipment/*` by the
 * top-level APP_ROUTES; paths here are relative to that mount point.
 *
 * The nested `:id/checks/new` path keeps the check form within the
 * equipment's URL namespace so the browser back button and breadcrumbs
 * feel natural.
 */
export const EQUIPMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/equipment-list/equipment-list.component').then(
        (m) => m.EquipmentListComponent,
      ),
    title: 'Equipment · Soteria',
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./pages/equipment-new/equipment-new.component').then(
        (m) => m.EquipmentNewComponent,
      ),
    title: 'New equipment · Soteria',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/equipment-detail/equipment-detail.component').then(
        (m) => m.EquipmentDetailComponent,
      ),
    title: 'Equipment · Soteria',
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/equipment-edit/equipment-edit.component').then(
        (m) => m.EquipmentEditComponent,
      ),
    title: 'Edit equipment · Soteria',
  },
  {
    path: ':id/checks/new',
    loadComponent: () =>
      import('./pages/equipment-check-new/equipment-check-new.component').then(
        (m) => m.EquipmentCheckNewComponent,
      ),
    title: 'Record check · Soteria',
  },
];
