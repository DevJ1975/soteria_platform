import { Routes } from '@angular/router';

import { AuthLayoutComponent } from '@layouts/auth-layout/auth-layout.component';
import { publicOnlyGuard } from '@core/guards/auth.guard';

/**
 * Routes for the unauthenticated area (login, signup, password reset).
 * The `publicOnlyGuard` redirects users who are already signed in.
 */
export const AUTH_ROUTES: Routes = [
  {
    path: '',
    component: AuthLayoutComponent,
    canActivate: [publicOnlyGuard],
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      {
        path: 'login',
        loadComponent: () =>
          import('./login/login.component').then((m) => m.LoginComponent),
        title: 'Sign in · Soteria',
      },
      {
        path: 'signup',
        loadComponent: () =>
          import('./signup/signup.component').then((m) => m.SignupComponent),
        title: 'Create account · Soteria',
      },
    ],
  },
];
