import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { UpdateUserSettingsRequest, UserSettings } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { LanguageService } from '../i18n/language.service';

/**
 * The signed-in user's personal preferences (`GET/PATCH /api/users/me/settings`, stored in `userSettings/{uid}`).
 * Loads on sign-in, applies the saved language, and saves language changes made anywhere in the app.
 */
@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly url = `${environment.apiBaseUrl}/users/me/settings`;

  /** Signed-in user with a tenant; a computed so hourly token refreshes (same uid) don't reload. */
  private readonly uid = computed(() => (this.auth.tenantId() ? this.auth.user()?.uid : undefined));

  /** null until loaded (or when signed out); callers fall back to defaults. */
  readonly settings = signal<UserSettings | null>(null);

  constructor() {
    effect(() => {
      const uid = this.uid();
      untracked(() => {
        this.settings.set(null);
        if (uid) void this.load();
      });
    });

    // Language switch in the top bar: follow the user across devices.
    this.language.onUserChange = (language) => {
      if (this.auth.tenantId()) void this.update({ language }).catch(() => undefined);
    };
  }

  async update(patch: UpdateUserSettingsRequest): Promise<UserSettings> {
    const saved = await firstValueFrom(this.http.patch<UserSettings>(this.url, patch));
    this.settings.set(saved);
    return saved;
  }

  private async load(): Promise<void> {
    try {
      const s = await firstValueFrom(this.http.get<UserSettings>(this.url));
      this.settings.set(s);
      await this.language.applyPreference(s.language);
    } catch {
      // Preferences are a convenience: defaults apply if they can't be loaded.
    }
  }
}
