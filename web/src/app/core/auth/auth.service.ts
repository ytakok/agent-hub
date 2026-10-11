import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  applyActionCode,
  confirmPasswordReset,
  EmailAuthProvider,
  GoogleAuthProvider,
  onIdTokenChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { firstValueFrom } from 'rxjs';
import type {
  AuthClaims,
  BootstrapUserRequest,
  EmailOtpStatus,
  SignupCompleteRequest,
  SignupCompleteResponse,
  SignupStartRequest,
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
  /** From the ID token (`email_verified`): Google accounts are verified; email/password signups confirm a code first. */
  readonly emailVerified = signal(false);
  /** Tenant the app may load data for: signed in, email verified and linked to an organization. */
  readonly activeTenantId = computed(() => (this.emailVerified() ? this.tenantId() : null));
  /** Signed in with Firebase but never completed /users/bootstrap (e.g. first Google sign-in). */
  readonly needsOnboarding = computed(() => this.isAuthenticated() && !this.tenantId());

  private readonly readyPromise: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.readyPromise = new Promise((r) => (resolveReady = r));
    onIdTokenChanged(this.firebase.auth, async (user) => {
      if (user) {
        const { claims } = await user.getIdTokenResult();
        this.emailVerified.set(claims['email_verified'] === true);
        this.claims.set(
          typeof claims['tenantId'] === 'string'
            ? { tenantId: claims['tenantId'], role: claims['role'] as Role, platformAdmin: claims['platformAdmin'] === true }
            : null,
        );
      } else {
        this.emailVerified.set(false);
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

  /** Signup step 1: emails a 6-digit code. Nothing is created in Firebase Auth yet. */
  startSignup(input: Pick<SignupInput, 'email' | 'username' | 'language'>): Promise<EmailOtpStatus> {
    const body: SignupStartRequest = { email: input.email.trim(), username: input.username.trim(), language: input.language };
    return firstValueFrom(this.http.post<EmailOtpStatus>(`${this.api}/auth/signup/start`, body));
  }

  /**
   * Signup step 2: the server checks the code, only then creates the (verified) account and organization,
   * and returns a custom token; signing in with it carries the tenant claims and `email_verified`.
   */
  async completeSignup(input: SignupInput, code: string): Promise<void> {
    const body: SignupCompleteRequest = {
      email: input.email.trim(),
      code,
      password: input.password,
      displayName: input.displayName,
      username: input.username.trim(),
      companyName: input.companyName,
      language: input.language,
    };
    const { customToken } = await firstValueFrom(this.http.post<SignupCompleteResponse>(`${this.api}/auth/signup/complete`, body));
    await signInWithCustomToken(this.firebase.auth, customToken);
  }

  /** Emails a 6-digit code; within the resend window the server skips sending and says how long to wait. */
  sendEmailOtp(language: Locale): Promise<EmailOtpStatus> {
    return firstValueFrom(this.http.post<EmailOtpStatus>(`${this.api}/auth/email-otp/send`, { language }));
  }

  /** Confirms the code, then refreshes the ID token so `email_verified` (and the guards) update. */
  async verifyEmailOtp(code: string): Promise<void> {
    await firstValueFrom(this.http.post<EmailOtpStatus>(`${this.api}/auth/email-otp/verify`, { code }));
    await this.firebase.auth.currentUser?.reload();
    await this.getIdToken(true);
    await new Promise((r) => setTimeout(r));
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

  async logout(): Promise<void> {
    await signOut(this.firebase.auth);
    await this.router.navigateByUrl('/auth/login');
  }
}

/** Machine-readable API error messages (409/400) → `auth.errors.*` keys. */
const API_MESSAGES: Record<string, string> = {
  email_in_use: 'emailInUse',
  username_taken: 'usernameTaken',
  weak_password: 'weakPassword',
};

/** Maps Firebase / API errors to i18n keys under `auth.errors.*`. */
export function authErrorKey(e: unknown): string {
  // Local development only: the UI shows a friendly message, the console shows Firebase's exact reason.
  if (!environment.production) console.warn('[auth] sign-in failed:', e instanceof FirebaseError ? `${e.code} - ${e.message}` : e);
  // API errors with a known machine-readable message (e.g. `otp_invalid`) win over the bare HTTP status.
  const apiMessage = (e as { error?: { message?: unknown } } | null)?.error?.message;
  const code =
    e instanceof FirebaseError
      ? e.code
      : typeof apiMessage === 'string' && (apiMessage.startsWith('otp_') || apiMessage in API_MESSAGES)
        ? apiMessage
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
    ...API_MESSAGES,
    otp_invalid: 'otpInvalid',
    otp_expired: 'otpExpired',
    otp_too_many_attempts: 'otpTooManyAttempts',
    'http/429': 'tooManyRequests',
    'http/0': 'network',
  };
  return `auth.errors.${map[code] ?? 'generic'}`;
}
