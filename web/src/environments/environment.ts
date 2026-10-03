import type { Environment } from './environment.model';

// Production. Fill from Firebase console → Project settings → Your apps (these values are public by design;
// access is enforced by Firebase Auth, App Check, security rules and the API).
export const environment: Environment = {
  production: true,
  apiBaseUrl: '/api',
  useEmulators: false,
  defaultTenant: 'demo-insurance',
  firebase: {
    apiKey: 'REPLACE_ME',
    authDomain: 'REPLACE_ME.firebaseapp.com',
    projectId: 'REPLACE_ME',
    appId: 'REPLACE_ME',
  },
  appCheckSiteKey: '',
};
