export interface Environment {
  production: boolean;
  apiBaseUrl: string;
  useEmulators: boolean;
  useLiveAuth: boolean;
  defaultTenant: string;
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string };
  /** reCAPTCHA Enterprise site key for App Check. Empty disables App Check. */
  appCheckSiteKey: string;
  /** n8n chat webhook for the in-app staff assistant (shown only after login). Empty = off. */
  assistantChatUrl: string;
}
