import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { UsersService } from './users.service.js';

/** In-memory Firestore: doc get (with .get(field)) and a batch of deletes. */
function fakeDb(initial: Record<string, Record<string, unknown>>) {
  const store = new Map(Object.entries(initial));
  const db = {
    doc: (path: string) => ({
      path,
      get: async () => ({ exists: store.has(path), get: (k: string) => store.get(path)?.[k] }),
    }),
    batch: () => {
      const paths: string[] = [];
      return {
        delete: (r: { path: string }) => void paths.push(r.path),
        commit: async () => paths.forEach((p) => store.delete(p)),
      };
    },
  } as unknown as Firestore;
  return { db, store };
}

const records = () => ({
  'usernames/dana': { uid: 'u1' },
  'users/u1': { uid: 'u1', tenantId: 't1' },
  'userSettings/u1': { language: 'he' },
  'tenants/t1/members/u1': { role: 'owner' },
  'tenants/t1': { name: 'Agency' },
});

function authWith(exists: boolean) {
  return {
    getUser: async () => {
      if (exists) return { uid: 'u1' };
      throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' });
    },
  } as unknown as Auth;
}

describe('UsersService.releaseUsernameIfOrphaned', () => {
  it('frees the username and leftover profile records of an account deleted in Firebase Auth', async () => {
    const { db, store } = fakeDb(records());
    await expect(new UsersService(authWith(false), db).releaseUsernameIfOrphaned('dana')).resolves.toBe(true);
    expect([...store.keys()]).toEqual(['tenants/t1']); // the organization itself is kept
  });

  it('keeps the username when its owner still exists', async () => {
    const { db, store } = fakeDb(records());
    await expect(new UsersService(authWith(true), db).releaseUsernameIfOrphaned('dana')).resolves.toBe(false);
    expect(store.has('usernames/dana')).toBe(true);
  });

  it('reports a never-used username as free', async () => {
    const { db } = fakeDb({});
    await expect(new UsersService(authWith(false), db).releaseUsernameIfOrphaned('new')).resolves.toBe(true);
  });
});
