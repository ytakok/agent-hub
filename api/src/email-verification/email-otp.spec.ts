import { ForbiddenException, HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { ALLOW_UNVERIFIED_EMAIL } from '../common/decorators/index.js';
import { EmailVerifiedGuard } from '../common/guards/email-verified.guard.js';
import type { AuthedRequest } from '../common/request-user.js';
import type { MailMessage, Mailer } from '../email/mailer.js';
import { EmailOtpService } from './email-otp.service.js';
import { OTP_MAX_ATTEMPTS, hashCode, verificationEmail } from './otp-store.js';

function ctx(req: Partial<AuthedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}
const reflectorWith = (meta: Record<string, unknown>) => ({ getAllAndOverride: (k: string) => meta[k] }) as unknown as Reflector;

describe('EmailVerifiedGuard', () => {
  const user = { uid: 'u1', platformAdmin: false };

  it('blocks accounts whose email is not verified', () => {
    expect(() => new EmailVerifiedGuard(reflectorWith({})).canActivate(ctx({ user: { ...user, emailVerified: false } }))).toThrow(
      ForbiddenException,
    );
  });

  it('lets verified accounts and @AllowUnverifiedEmail routes through', () => {
    expect(new EmailVerifiedGuard(reflectorWith({})).canActivate(ctx({ user: { ...user, emailVerified: true } }))).toBe(true);
    expect(
      new EmailVerifiedGuard(reflectorWith({ [ALLOW_UNVERIFIED_EMAIL]: true })).canActivate(ctx({ user: { ...user, emailVerified: false } })),
    ).toBe(true);
  });
});

/** In-memory Firestore with doc get/set/delete and a pass-through transaction. */
function fakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({
    path,
    get: async () => ({ data: () => store.get(path) }),
    set: async (v: Record<string, unknown>) => void store.set(path, { ...v }),
    delete: async () => void store.delete(path),
  });
  const db = {
    doc: ref,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: (r: { get: () => unknown }) => r.get(),
        update: (r: { path: string }, v: Record<string, unknown>) => store.set(r.path, { ...store.get(r.path), ...v }),
        delete: (r: { path: string }) => store.delete(r.path),
      }),
  } as unknown as Firestore;
  return { db, store };
}

function setup(emailVerified = false) {
  const { db, store } = fakeDb();
  const sent: MailMessage[] = [];
  const mailer: Mailer = { send: async (m) => void sent.push(m) };
  const updateUser = vi.fn().mockResolvedValue(undefined);
  const auth = { getUser: async () => ({ uid: 'u1', email: 'new@agency.test', emailVerified }), updateUser } as unknown as Auth;
  return { service: new EmailOtpService(auth, db, mailer), store, sent, updateUser };
}
const codeFrom = (m: MailMessage) => /\b(\d{6})\b/.exec(m.text)![1]!;
const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: HttpException) => e);

describe('EmailOtpService', () => {
  it('emails a 6-digit code and stores only its hash', async () => {
    const { service, store, sent } = setup();
    const status = await service.send('u1', 'en');
    expect(status).toMatchObject({ verified: false, retryAfterSeconds: 60, expiresInSeconds: 600 });
    const code = codeFrom(sent[0]!);
    const doc = store.get('emailOtps/u1')!;
    expect(doc['codeHash']).toBe(hashCode('u1', code));
    expect(JSON.stringify(doc)).not.toContain(code);
  });

  it('does not send another code within the resend window', async () => {
    const { service, sent } = setup();
    await service.send('u1', 'he');
    const again = await service.send('u1', 'he');
    expect(sent).toHaveLength(1);
    expect(again.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('marks the Firebase account verified on the right code and removes the code', async () => {
    const { service, store, sent, updateUser } = setup();
    await service.send('u1', 'en');
    await expect(service.verify('u1', codeFrom(sent[0]!))).resolves.toEqual({ verified: true });
    expect(updateUser).toHaveBeenCalledWith('u1', { emailVerified: true });
    expect(store.has('emailOtps/u1')).toBe(false);
  });

  it('rejects wrong codes and locks after the maximum attempts', async () => {
    const { service, sent, updateUser } = setup();
    await service.send('u1', 'en');
    const wrong = codeFrom(sent[0]!) === '000000' ? '111111' : '000000';
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) expect((await errorOf(service.verify('u1', wrong)))?.message).toBe('otp_invalid');
    const last = await errorOf(service.verify('u1', wrong));
    expect(last?.message).toBe('otp_too_many_attempts');
    expect(last?.getStatus()).toBe(429);
    // Even the right code is refused once locked.
    expect((await errorOf(service.verify('u1', codeFrom(sent[0]!))))?.message).toBe('otp_too_many_attempts');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('treats a missing or expired code as expired', async () => {
    const { service, store, sent } = setup();
    expect((await errorOf(service.verify('u1', '123456')))?.message).toBe('otp_expired');
    await service.send('u1', 'en');
    store.set('emailOtps/u1', { ...store.get('emailOtps/u1'), expiresAt: Date.now() - 1 });
    expect((await errorOf(service.verify('u1', codeFrom(sent[0]!))))?.message).toBe('otp_expired');
  });

  it('skips everything for already verified accounts', async () => {
    const { service, sent } = setup(true);
    await expect(service.send('u1', 'en')).resolves.toEqual({ verified: true });
    expect(sent).toHaveLength(0);
  });
});

describe('verificationEmail', () => {
  it('writes Hebrew mail right-to-left with the code isolated left-to-right', () => {
    const m = verificationEmail('a@b.c', '042917', 'he');
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain('<p dir="ltr"');
    expect(m.text).toContain('042917');
  });
});
