import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { EmailOtpStatus, Locale } from '@agency-hub/shared';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.module.js';
import { MAILER, type Mailer } from '../email/mailer.js';
import { OTP_RESEND_SECONDS, OTP_TTL_SECONDS, checkCode, issueCode, mailCode, verificationEmail } from './otp-store.js';

/**
 * Fallback for accounts that already exist in Firebase Auth but are unverified (created before signup required
 * a code, or directly through the Firebase API). New signups never get here: SignupService creates them verified.
 * Codes live in `emailOtps/{uid}`.
 */
@Injectable()
export class EmailOtpService {
  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Sends a new code unless one was sent in the last minute (then reports how long to wait). */
  async send(uid: string, language: Locale): Promise<EmailOtpStatus> {
    const user = await this.auth.getUser(uid);
    if (user.emailVerified) return { verified: true };
    if (!user.email) throw new BadRequestException('Account has no email address');

    const ref = this.db.doc(`emailOtps/${uid}`);
    const issued = await issueCode(ref, uid);
    if (!('code' in issued)) return { verified: false, retryAfterSeconds: issued.retryAfterSeconds };
    await mailCode((m) => this.mailer.send(m), ref, verificationEmail(user.email, issued.code, language));
    return { verified: false, retryAfterSeconds: OTP_RESEND_SECONDS, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verify(uid: string, code: string): Promise<EmailOtpStatus> {
    const user = await this.auth.getUser(uid);
    if (user.emailVerified) return { verified: true };

    const ref = this.db.doc(`emailOtps/${uid}`);
    await checkCode(this.db, ref, uid, code);
    await this.auth.updateUser(uid, { emailVerified: true });
    await ref.delete();
    return { verified: true };
  }
}
