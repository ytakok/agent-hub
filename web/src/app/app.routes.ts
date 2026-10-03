import type { Routes } from '@angular/router';
import { authGuard, featureGuard } from './core/auth/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'customers',
        title: 'Customers',
        canMatch: [featureGuard('module.customers')],
        loadComponent: () => import('./features/customers/customers.page').then((m) => m.CustomersPage),
      },
      {
        path: 'messages',
        title: 'Messages',
        canMatch: [featureGuard('module.messages')],
        loadComponent: () => import('./features/messages/messages.page').then((m) => m.MessagesPage),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: 'app/dashboard' },
];
