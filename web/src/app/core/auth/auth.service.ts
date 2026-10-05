import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  onIdTokenChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { firstValueFrom } from 'rxjs';
import type {
  AuthClaims,
  BootstrapUserRequest,
  Locale,
  Role,
  UserProfile,
  UsernameLoginRequest,
  UsernameLoginResponse,
} from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { appUrl } from '../app-url';
import { FirebaseService } from '../firebase/firebase.service';

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  username: string;
  companyName: string;
  language: Locale;
}

/**
 * Firebase Auth is the only place credentials live. This service exposes auth state as signals
 * and wraps every flow (email, username, Google, signup, reset, verify, change password).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebase = inject(FirebaseService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = environment.apiBaseUrl;

  /** undefined = not yet known (initial load). */
  readonly user = signal<User | null | undefined>(undefined);
  readonly claims = signal<(AuthClaims & { platformAdmin?: boolean }) | null>(null);

  readonly isAuthenticated = computed(() => !!this.user());
  readonly tenantId = computed(() => this.claims()?.tenantId ?? null);
  readonly role = computed<Role | null>(() => this.claims()?.role ?? null);
  readonly isPlatformAdmin = computed(() => this.claims()?.platformAdmin === true);
  /** Signed in with Firebase but never completed /users/bootstrap (e.g. first Google sign-in). */
  readonly needsOnboarding = computed(() => this.isAuthenticated() && !this.tenantId());

  private readonly readyPromise: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.readyPromise = new Promise((r) => (resolveReady = r));
    onIdTokenChanged(this.firebase.auth, async (user) => {
      if (user) {
        const { claims } = await user.getIdTokenResult();
        this.claims.set(
          typeof claims['tenantId'] === 'string'
            ? { tenantId: claims['tenantId'], role: claims['role'] as Role, platformAdmin: claims['platformAdmin'] === true }
            : null,
        );
      } else {
        this.claims.set(null);
      }
      this.user.set(user);
      resolveReady();
    });
  }

  /** Resolves once the persisted session (if any) has been restored. Guards await this. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  async getIdToken(forceRefresh = false): Promise<string | null> {
    return (await this.firebase.auth.currentUser?.getIdToken(forceRefresh)) ?? null;
  }

  /** Accepts either an email or a username. */
  async login(identifier: string, password: string): Promise<void> {
    if (identifier.includes('@')) {
      await signInWithEmailAndPassword(this.firebase.auth, identifier.trim(), password);
      return;
    }
    const body: UsernameLoginRequest = { username: identifier.trim(), password };
    const { customToken } = await firstValueFrom(this.http.post<UsernameLoginResponse>(`${this.api}/auth/login`, body));
    await signInWithCustomToken(this.firebase.auth, customToken);
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(this.firebase.auth, provider);
  }

  async signup(input: SignupInput): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.firebase.auth, input.email.trim(), input.password);
    await updateProfile(user, { displayName: input.displayName });
    await sendEmailVerification(user, { url: appUrl('auth/login') });
    await this.bootstrap({
      username: input.username,
      displayName: input.displayName,
      companyName: input.companyName,
      language: input.language,
    });
  }

  /** Creates profile + tenant link on the server, then refreshes the token to pick up the new claims. */
  async bootstrap(dto: BootstrapUserRequest): Promise<UserProfile> {
    const profile = await firstValueFrom(this.http.post<UserProfile>(`${this.api}/users/bootstrap`, dto));
    await this.getIdToken(true);
    // onIdTokenChanged fires with the new claims.
    await new Promise((r) => setTimeout(r));
    return profile;
  }

  /** Hides missing accounts but propagates delivery and configuration failures. */
  async forgotPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.firebase.auth, email.trim(), { url: appUrl('auth/login') });
    } catch (e) {
      if (e instanceof FirebaseError && e.code === 'auth/user-not-found') return;
      throw e;
    }
  }

  /** Returns the account email the reset code belongs to. */
  verifyResetCode(oobCode: string): Promise<string> {
    return verifyPasswordResetCode(this.firebase.auth, oobCode);
  }

  confirmReset(oobCode: string, newPassword: string): Promise<void> {
    return confirmPasswordReset(this.firebase.auth, oobCode, newPassword);
  }

  async verifyEmail(oobCode: string): Promise<void> {
    await applyActionCode(this.firebase.auth, oobCode);
    await this.firebase.auth.currentUser?.reload();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.firebase.auth.currentUser;
    if (!user?.email) throw new Error('auth/no-current-user');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
  }

  async resendVerification(): Promise<void> {
    const user = this.firebase.auth.currentUser;
    if (user && !user.emailVerified) await sendEmailVerification(user, { url: appUrl('app/dashboard') });
  }

  async logout(): Promise<void> {
    await signOut(this.firebase.auth);
    await this.router.navigateByUrl('/auth/login');
  }
}

/** Maps Firebase / API errors to i18n keys under `auth.errors.*`. */
export function authErrorKey(e: unknown): string {
  const code =
    e instanceof FirebaseError
      ? e.code
      : typeof e === 'object' && e !== null && 'status' in e
        ? `http/${(e as { status: number }).status}`
        : 'unknown';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'invalidCredentials',
    'auth/wrong-password': 'invalidCredentials',
    'auth/user-not-found': 'invalidCredentials',
    'auth/invalid-email': 'invalidEmail',
    'auth/user-disabled': 'userDisabled',
    'auth/too-many-requests': 'tooManyRequests',
    'auth/email-already-in-use': 'emailInUse',
    'auth/weak-password': 'weakPassword',
    'auth/popup-closed-by-user': 'popupClosed',
    'auth/cancelled-popup-request': 'popupClosed',
    'auth/network-request-failed': 'network',
    'auth/expired-action-code': 'linkExpired',
    'auth/invalid-action-code': 'linkInvalid',
    'auth/requires-recent-login': 'recentLogin',
    'http/401': 'invalidCredentials',
    'http/409': 'usernameTaken',
    'http/429': 'tooManyRequests',
    'http/0': 'network',
  };
  return `auth.errors.${map[code] ?? 'generic'}`;
}
