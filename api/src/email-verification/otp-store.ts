import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { EmailOtpError, Locale } from '@agency-hub/shared';
import type { MailMessage } from '../email/mailer.js';

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

/** Server-only Firestore document holding one pending code. Only the code's hash is stored. */
export interface OtpDoc {
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

/** `salt` ties the hash to its owner (uid or email), so a hash can't be reused for anyone else. */
export function hashCode(salt: string, code: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export type IssueResult = { code: string } | { retryAfterSeconds: number };

/**
 * Creates a new 6-digit code at `ref` (replacing any older one), unless one was sent within the resend window.
 * `extra` fields are stored alongside (e.g. the email a pending signup belongs to).
 */
export async function issueCode(ref: DocumentReference, salt: string, extra: Record<string, unknown> = {}): Promise<IssueResult> {
  const now = Date.now();
  const existing = (await ref.get()).data() as OtpDoc | undefined;
  if (existing && now - existing.sentAt < OTP_RESEND_SECONDS * 1000) {
    return { retryAfterSeconds: Math.ceil((existing.sentAt + OTP_RESEND_SECONDS * 1000 - now) / 1000) };
  }
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const doc: OtpDoc = { codeHash: hashCode(salt, code), expiresAt: now + OTP_TTL_SECONDS * 1000, sentAt: now, attempts: 0 };
  await ref.set({ ...extra, ...doc });
  return { code };
}

/**
 * Checks a code; wrong guesses count toward the limit inside a transaction, so parallel guesses can't share one attempt.
 * Throws 400 (`otp_invalid` / `otp_expired`) or 429 (`otp_too_many_attempts`). The document is left in place:
 * callers delete it once whatever the code unlocks has succeeded.
 */
export async function checkCode(db: Firestore, ref: DocumentReference, salt: string, code: string): Promise<void> {
  const outcome = await db.runTransaction(async (tx) => {
    const doc = (await tx.get(ref)).data() as OtpDoc | undefined;
    if (!doc || doc.expiresAt < Date.now()) return 'otp_expired' as const;
    if (doc.attempts >= OTP_MAX_ATTEMPTS) return 'otp_too_many_attempts' as const;
    if (!sameHash(doc.codeHash, hashCode(salt, code))) {
      tx.update(ref, { attempts: doc.attempts + 1 });
      return doc.attempts + 1 >= OTP_MAX_ATTEMPTS ? ('otp_too_many_attempts' as const) : ('otp_invalid' as const);
    }
    return 'ok' as const;
  });
  if (outcome === 'otp_too_many_attempts') throw new HttpException(outcome satisfies EmailOtpError, HttpStatus.TOO_MANY_REQUESTS);
  if (outcome !== 'ok') throw new BadRequestException(outcome satisfies EmailOtpError);
}

const COPY: Record<Locale, { subject: string; intro: string; expires: string; ignore: string }> = {
  en: {
    subject: 'Your Agency Hub verification code',
    intro: 'Use this code to verify your email address:',
    expires: `The code expires in ${OTP_TTL_SECONDS / 60} minutes.`,
    ignore: "If you didn't create an account, you can ignore this email.",
  },
  he: {
    subject: 'קוד האימות שלך ל-Agency Hub',
    intro: 'הזינו את הקוד הזה כדי לאמת את כתובת המייל:',
    expires: `הקוד בתוקף ל-${OTP_TTL_SECONDS / 60} דקות.`,
    ignore: 'אם לא פתחתם חשבון, אפשר להתעלם מהמייל הזה.',
  },
};

export function verificationEmail(to: string, code: string, language: Locale): MailMessage {
  const c = COPY[language] ?? COPY.en;
  const dir = language === 'he' ? 'rtl' : 'ltr';
  return {
    to,
    subject: c.subject,
    text: `${c.intro}\n\n${code}\n\n${c.expires}\n${c.ignore}`,
    html: `<div dir="${dir}" style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
<p>${c.intro}</p>
<p dir="ltr" style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>
<p>${c.expires}</p>
<p style="color:#64748b">${c.ignore}</p>
</div>`,
  };
}

/** Sends the email; on failure the code is removed so the user can request a new one right away. */
export async function mailCode(send: (m: MailMessage) => Promise<void>, ref: DocumentReference, message: MailMessage): Promise<void> {
  try {
    await send(message);
  } catch (e) {
    await ref.delete();
    throw e instanceof HttpException ? e : new HttpException('Could not send the email', HttpStatus.SERVICE_UNAVAILABLE);
  }
}
