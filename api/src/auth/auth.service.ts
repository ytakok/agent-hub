import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { UsernameLoginResponse } from '@agency-hub/shared';
import { AppConfig } from '../config/app-config.service.js';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.module.js';

const INVALID = 'Invalid username or password';

/**
 * Username login. Firebase Auth only knows emails, so the server resolves username → account,
 * verifies the password with Identity Toolkit and returns a custom token. The email is never exposed.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly config: AppConfig,
  ) {}

  async loginWithUsername(username: string, password: string): Promise<UsernameLoginResponse> {
    const started = Date.now();
    try {
      const snap = await this.db.doc(`usernames/${username.trim().toLowerCase()}`).get();
      const uid = snap.get('uid') as string | undefined;
      const user = uid ? await this.auth.getUser(uid).catch(() => undefined) : undefined;
      if (!user?.email || user.disabled || !(await this.verifyPassword(user.email, password))) {
        throw new UnauthorizedException(INVALID);
      }
      return { customToken: await this.auth.createCustomToken(user.uid) };
    } catch (err) {
      // Equalize timing so response time does not reveal whether the username exists.
      await sleep(Math.max(0, 600 - (Date.now() - started)));
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`Username login failed: ${String(err)}`);
      throw new UnauthorizedException(INVALID);
    }
  }

  private async verifyPassword(email: string, password: string): Promise<boolean> {
    const emulator = this.config.get('FIREBASE_AUTH_EMULATOR_HOST');
    const base = emulator
      ? `http://${emulator}/identitytoolkit.googleapis.com`
      : 'https://identitytoolkit.googleapis.com';
    const res = await fetch(`${base}/v1/accounts:signInWithPassword?key=${this.config.get('FIREBASE_WEB_API_KEY')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    });
    return res.ok;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
