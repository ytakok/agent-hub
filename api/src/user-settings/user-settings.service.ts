import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { Locale, UpdateUserSettingsRequest, UserProfile, UserSettings } from '@agency-hub/shared';
import { FIRESTORE } from '../firebase/firebase.module.js';

export const USER_SETTINGS_COLLECTION = 'userSettings';

export function defaultUserSettings(language: Locale = 'he'): UserSettings {
  return { language, dashboard: { defaultRange: '30d', hiddenWidgets: [] } };
}

/** Stored documents may predate a field; fill the gaps so clients always get the full shape. */
export function withDefaults(stored: Partial<UserSettings> | undefined, fallbackLanguage?: Locale): UserSettings {
  const base = defaultUserSettings(stored?.language ?? fallbackLanguage);
  return {
    ...base,
    ...stored,
    dashboard: { ...base.dashboard, ...stored?.dashboard },
  };
}

/**
 * Per-user preferences in `userSettings/{uid}` (one document per user, keyed by the verified uid).
 * The document is created on the first save; until then the defaults apply.
 */
@Injectable()
export class UserSettingsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async get(uid: string): Promise<UserSettings> {
    const snap = await this.db.doc(`${USER_SETTINGS_COLLECTION}/${uid}`).get();
    if (snap.exists) return withDefaults(snap.data() as Partial<UserSettings>);
    // Older accounts kept the language on the profile; carry it over until the first save.
    const profile = await this.db.doc(`users/${uid}`).get();
    return withDefaults(undefined, (profile.data() as UserProfile | undefined)?.preferences?.language);
  }

  async update(uid: string, patch: UpdateUserSettingsRequest): Promise<UserSettings> {
    const current = await this.get(uid);
    const next: UserSettings = {
      language: patch.language ?? current.language,
      dashboard: { ...current.dashboard, ...patch.dashboard },
      updatedAt: new Date().toISOString(),
    };
    await this.db.doc(`${USER_SETTINGS_COLLECTION}/${uid}`).set(next);
    return next;
  }
}
