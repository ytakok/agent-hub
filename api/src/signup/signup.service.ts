import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { EmailOtpStatus, SignupCompleteRequest, SignupCompleteResponse, SignupError, SignupStartRequest } from '@agency-hub/shared';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.module.js';
import { MAILER, type Mailer } from '../email/mailer.js';
import { OTP_RESEND_SECONDS, OTP_TTL_SECONDS, checkCode, issueCode, mailCode, verificationEmail } from '../email-verification/otp-store.js';
import { UsersService } from '../users/users.service.js';

/** Same policy as the signup form (web `features/auth/password.ts`); checked again here because clients can be bypassed. */
const PASSWORD_RULES = [/.{10,}/, /[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/];

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function conflict(code: SignupError): ConflictException {
  return new ConflictException(code);
}

/**
 * Email/password signup that creates nothing in Firebase Auth until the email is proven.
 * Pending codes live in `pendingSignups/{sha256(email)}` (server-only); the password is never stored,
 * it is sent once with the code and handed straight to Firebase Auth.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly users: UsersService,
  ) {}

  private pendingRef(email: string) {
    return this.db.doc(`pendingSignups/${createHash('sha256').update(email).digest('hex')}`);
  }

  /** Step 1: checks the email and username are free, then emails a code. No account is created. */
  async start(dto: SignupStartRequest): Promise<EmailOtpStatus> {
    const email = normalizeEmail(dto.email);
    await this.assertAvailable(email, dto.username);

    const ref = this.pendingRef(email);
    const issued = await issueCode(ref, email, { email });
    if (!('code' in issued)) return { verified: false, retryAfterSeconds: issued.retryAfterSeconds };
    await mailCode((m) => this.mailer.send(m), ref, verificationEmail(email, issued.code, dto.language));
    return { verified: false, retryAfterSeconds: OTP_RESEND_SECONDS, expiresInSeconds: OTP_TTL_SECONDS };
  }

  /** Step 2: right code → create the (already verified) Firebase user and organization, return a sign-in token. */
  async complete(dto: SignupCompleteRequest): Promise<SignupCompleteResponse> {
    const email = normalizeEmail(dto.email);
    if (!isStrongPassword(dto.password)) throw new BadRequestException('weak_password' satisfies SignupError);

    const ref = this.pendingRef(email);
    await checkCode(this.db, ref, email, dto.code);

    let uid: string;
    try {
      uid = (await this.auth.createUser({ email, password: dto.password, displayName: dto.displayName, emailVerified: true })).uid;
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/email-already-exists') throw conflict('email_in_use');
      throw e;
    }

    try {
      await this.users.bootstrap(
        { uid, email, emailVerified: true, platformAdmin: false },
        { username: dto.username, displayName: dto.displayName, companyName: dto.companyName, language: dto.language },
      );
    } catch (e) {
      // Don't leave a half-created account behind (e.g. the username was taken a moment ago).
      await this.auth.deleteUser(uid).catch((err: unknown) => this.logger.error(`Could not remove partial signup ${uid}: ${String(err)}`));
      if (e instanceof ConflictException) throw conflict('username_taken');
      throw e;
    }

    await ref.delete();
    return { customToken: await this.auth.createCustomToken(uid) };
  }

  private async assertAvailable(email: string, username: string): Promise<void> {
    const existing = await this.auth.getUserByEmail(email).catch((e: { code?: string }) => {
      if (e.code === 'auth/user-not-found') return null;
      throw e;
    });
    if (existing) throw conflict('email_in_use');
    if (!(await this.users.releaseUsernameIfOrphaned(username.trim().toLowerCase()))) throw conflict('username_taken');
  }
}
