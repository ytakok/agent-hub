import type { Routes } from '@angular/router';
import { guestGuard, onboardingGuard } from '../../core/auth/guards';
import { AuthLayout } from './auth-layout';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./login.page').then((m) => m.LoginPage) },
      { path: 'signup', canActivate: [guestGuard], loadComponent: () => import('./signup.page').then((m) => m.SignupPage) },
      {
        path: 'forgot-password',
        canActivate: [guestGuard],
        loadComponent: () => import('./forgot-password.page').then((m) => m.ForgotPasswordPage),
      },
      // Target of Firebase email links (set as the custom action URL in the Firebase console).
      { path: 'action', loadComponent: () => import('./auth-action.page').then((m) => m.AuthActionPage) },
      {
        path: 'complete-profile',
        canActivate: [onboardingGuard],
        loadComponent: () => import('./complete-profile.page').then((m) => m.CompleteProfilePage),
      },
    ],
  },
];
