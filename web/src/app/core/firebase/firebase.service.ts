import { Injectable } from '@angular/core';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { environment } from '../../../environments/environment';

/**
 * Thin wrapper over the Firebase JS SDK (AngularFire does not yet support this Angular version).
 * The rest of the app depends on this service, never on `firebase/*` globals directly.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp = initializeApp(environment.firebase);
  readonly auth: Auth = getAuth(this.app);
  private readonly appCheck: AppCheck | null = null;

  constructor() {
    const useAuthEmulator = environment.useEmulators && !environment.useLiveAuth;
    if (useAuthEmulator) {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } else if (environment.appCheckSiteKey) {
      this.appCheck = initializeAppCheck(this.app, {
        provider: new ReCaptchaEnterpriseProvider(environment.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }

  async getAppCheckToken(): Promise<string | null> {
    if (!this.appCheck) return null;
    try {
      return (await getToken(this.appCheck)).token;
    } catch {
      return null;
    }
  }
}
