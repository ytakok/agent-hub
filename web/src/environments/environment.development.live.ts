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
  // Same-origin path, forwarded to the n8n chat webhook by proxy.conf.json (avoids n8n CORS in local dev).
  assistantChatUrl: '/assistant-chat',
};
