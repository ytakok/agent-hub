import type { Environment } from './environment.model';
import { firebaseConfig } from './firebase.config';

export const environment: Environment = {
  production: false,
  apiBaseUrl: '/api',
  useEmulators: false,
  useLiveAuth: true,
  defaultTenant: 'demo-insurance',
  firebase: firebaseConfig,
  appCheckSiteKey: '',
};
