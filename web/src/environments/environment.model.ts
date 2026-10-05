export interface Environment {
  production: boolean;
  apiBaseUrl: string;
  useEmulators: boolean;
  useLiveAuth: boolean;
  defaultTenant: string;
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string };
  /** reCAPTCHA Enterprise site key for App Check. Empty disables App Check. */
  appCheckSiteKey: string;
}
