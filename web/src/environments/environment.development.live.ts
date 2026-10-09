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
  assistantChatUrl: 'https://inteliaiconsultancy.app.n8n.cloud/webhook/446e48f9-570a-416a-be34-394c3c540779/chat',
};
