import { ConflictException, type HttpException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { SignupCompleteRequest } from '@agency-hub/shared';
import type { MailMessage } from '../email/mailer.js';
import type { UsersService } from '../users/users.service.js';
import { SignupService, isStrongPassword } from './signup.service.js';

/** In-memory Firestore with doc get/set/delete and a pass-through transaction. */
function fakeDb(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(initial));
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (v: Record<string, unknown>) => void store.set(path, { ...v }),
    delete: async () => void store.delete(path),
  });
  const db = {
    doc: ref,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: (r: { get: () => unknown }) => r.get(),
        update: (r: { path: string }, v: Record<string, unknown>) => store.set(r.path, { ...store.get(r.path), ...v }),
      }),
  } as unknown as Firestore;
  return { db, store };
}

function setup(opts: { existingEmail?: boolean; takenUsername?: boolean; bootstrapFails?: boolean } = {}) {
  const { db, store } = fakeDb();
  const sent: MailMessage[] = [];
  const auth = {
    getUserByEmail: vi.fn(async () => {
      if (opts.existingEmail) return { uid: 'old' };
      throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
    }),
    createUser: vi.fn(async () => ({ uid: 'new-uid' })),
    deleteUser: vi.fn(async () => undefined),
    createCustomToken: vi.fn(async () => 'custom-token'),
  };
  const users = {
    releaseUsernameIfOrphaned: vi.fn(async () => !opts.takenUsername),
    bootstrap: vi.fn(async () => {
      if (opts.bootstrapFails) throw new ConflictException('Username is already taken');
      return {};
    }),
  };
  const service = new SignupService(auth as unknown as Auth, db, { send: async (m) => void sent.push(m) }, users as unknown as UsersService);
  return { service, auth, users, store, sent };
}

const EMAIL = 'New.Agent@Agency.test';
const codeFrom = (m: MailMessage) => /\n(\d{6})\n/.exec(m.text)![1]!;
const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: HttpException) => e);
const completeDto = (code: string, over: Partial<SignupCompleteRequest> = {}): SignupCompleteRequest => ({
  email: EMAIL,
  code,
  password: 'Str0ng-Passw0rd!',
  displayName: 'New Agent',
  username: 'newagent',
  companyName: 'New Agency',
  language: 'en',
  ...over,
});

describe('SignupService', () => {
  it('emails a code without creating any Firebase account', async () => {
    const { service, auth, sent } = setup();
    const status = await service.start({ email: EMAIL, username: 'newagent', language: 'en' });
    expect(status).toMatchObject({ verified: false, expiresInSeconds: 600 });
    expect(sent[0]!.to).toBe('new.agent@agency.test');
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('refuses emails and usernames that are already registered', async () => {
    expect((await errorOf(setup({ existingEmail: true }).service.start({ email: EMAIL, username: 'a1b', language: 'en' })))?.message).toBe('email_in_use');
    expect((await errorOf(setup({ takenUsername: true }).service.start({ email: EMAIL, username: 'Taken', language: 'en' })))?.message).toBe('username_taken');
  });

  it('creates nothing on a wrong code', async () => {
    const { service, auth, sent } = setup();
    await service.start({ email: EMAIL, username: 'newagent', language: 'en' });
    const wrong = codeFrom(sent[0]!) === '000000' ? '111111' : '000000';
    expect((await errorOf(service.complete(completeDto(wrong))))?.message).toBe('otp_invalid');
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('on the right code creates a verified account, the organization, and returns a sign-in token', async () => {
    const { service, auth, users, store, sent } = setup();
    await service.start({ email: EMAIL, username: 'newagent', language: 'en' });
    const result = await service.complete(completeDto(codeFrom(sent[0]!)));
    expect(result).toEqual({ customToken: 'custom-token' });
    expect(auth.createUser).toHaveBeenCalledWith({
      email: 'new.agent@agency.test',
      password: 'Str0ng-Passw0rd!',
      displayName: 'New Agent',
      emailVerified: true,
    });
    expect(users.bootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'new-uid', emailVerified: true }),
      { username: 'newagent', displayName: 'New Agent', companyName: 'New Agency', language: 'en' },
    );
    expect([...store.keys()].some((k) => k.startsWith('pendingSignups/'))).toBe(false);
    // The password is never written anywhere in Firestore.
    expect(JSON.stringify([...store.values()])).not.toContain('Str0ng-Passw0rd!');
  });

  it('removes the new account if setting up the organization fails', async () => {
    const { service, auth, sent } = setup({ bootstrapFails: true });
    await service.start({ email: EMAIL, username: 'newagent', language: 'en' });
    expect((await errorOf(service.complete(completeDto(codeFrom(sent[0]!)))))?.message).toBe('username_taken');
    expect(auth.deleteUser).toHaveBeenCalledWith('new-uid');
  });

  it('rejects weak passwords before touching the code', async () => {
    const { service, sent } = setup();
    await service.start({ email: EMAIL, username: 'newagent', language: 'en' });
    expect((await errorOf(service.complete(completeDto(codeFrom(sent[0]!), { password: 'short' }))))?.message).toBe('weak_password');
  });
});

describe('isStrongPassword', () => {
  it('matches the signup form policy', () => {
    expect(isStrongPassword('Str0ng-Passw0rd!')).toBe(true);
    expect(isStrongPassword('alllowercase1!')).toBe(false);
    expect(isStrongPassword('Sh0rt!')).toBe(false);
  });
});
