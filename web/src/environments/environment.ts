import type { Environment } from './environment.model';
import { firebaseConfig } from './firebase.config';

// Production. Fill from Firebase console → Project settings → Your apps (these values are public by design;
// access is enforced by Firebase Auth, App Check, security rules and the API).
export const environment: Environment = {
  production: true,
  // API on Render (GitHub Pages can't run it). Free tier sleeps after ~15 min idle: first call may take ~30–50 s.
  apiBaseUrl: 'https://agent-hub-0xke.onrender.com/api',
  useEmulators: false,
  useLiveAuth: true,
  defaultTenant: 'demo-insurance',
  firebase: firebaseConfig,
  appCheckSiteKey: '',
  assistantChatUrl: 'https://inteliaiconsultancy.app.n8n.cloud/webhook/446e48f9-570a-416a-be34-394c3c540779/chat',
};
