import type { Environment } from './environment.model';

// Local development against the Firebase Emulator Suite. "demo-" project IDs never reach real Firebase.
export const environment: Environment = {
  production: false,
  apiBaseUrl: '/api',
  useEmulators: true,
  useLiveAuth: false,
  defaultTenant: 'demo-insurance',
  firebase: {
    apiKey: 'demo-key',
    authDomain: 'demo-agency-hub.firebaseapp.com',
    projectId: 'demo-agency-hub',
    appId: 'demo-app',
  },
  appCheckSiteKey: '',
};
