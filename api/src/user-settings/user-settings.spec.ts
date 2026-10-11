import type { Firestore } from 'firebase-admin/firestore';
import { DashboardPrefsDto, UpdateUserSettingsDto, toUserSettingsPatch } from './user-settings.controller.js';
import { UserSettingsService, withDefaults } from './user-settings.service.js';

/** Minimal in-memory Firestore: just `doc(path).get()` and `.set()`. */
function fakeDb(docs: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(docs));
  const db = {
    doc: (path: string) => ({
      get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
      set: async (value: unknown) => void store.set(path, value),
    }),
  } as unknown as Firestore;
  return { db, store };
}

describe('toUserSettingsPatch', () => {
  it('copies only sent fields into plain objects', () => {
    const dto = Object.assign(new UpdateUserSettingsDto(), {
      dashboard: Object.assign(new DashboardPrefsDto(), { hiddenWidgets: ['gmail'] }),
    });
    const patch = toUserSettingsPatch(dto);
    expect(patch).toEqual({ dashboard: { hiddenWidgets: ['gmail'] } });
    expect(Object.getPrototypeOf(patch.dashboard)).toBe(Object.prototype);
    expect('language' in patch).toBe(false);
    expect('defaultRange' in patch.dashboard!).toBe(false);
  });
});

describe('withDefaults', () => {
  it('fills fields missing from older documents', () => {
    expect(withDefaults({ language: 'en' })).toEqual({ language: 'en', dashboard: { defaultRange: '30d', hiddenWidgets: [] } });
  });
});

describe('UserSettingsService', () => {
  it('falls back to the legacy profile language before the first save', async () => {
    const { db } = fakeDb({ 'users/u1': { preferences: { language: 'en' } } });
    const settings = await new UserSettingsService(db).get('u1');
    expect(settings.language).toBe('en');
    expect(settings.dashboard.defaultRange).toBe('30d');
  });

  it('merges a partial update into userSettings/{uid}', async () => {
    const { db, store } = fakeDb({ 'userSettings/u1': { language: 'he', dashboard: { defaultRange: '7d', hiddenWidgets: ['gmail'] } } });
    const result = await new UserSettingsService(db).update('u1', { dashboard: { hiddenWidgets: [] } });
    expect(result).toMatchObject({ language: 'he', dashboard: { defaultRange: '7d', hiddenWidgets: [] } });
    expect(store.get('userSettings/u1')).toEqual(result);
  });
});
