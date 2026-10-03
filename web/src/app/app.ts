import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Locale, UserProfile } from '@agency-hub/shared';
import { environment } from '../environments/environment';
import { AuthService } from './core/auth/auth.service';
import { LanguageService } from './core/i18n/language.service';

@Component({
  selector: 'ah-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);

  constructor() {
    // Language preference follows the user across devices: load it on sign-in, save it on change.
    effect(() => {
      const tenantId = this.auth.tenantId();
      if (!tenantId) return;
      untracked(() => {
        firstValueFrom(this.http.get<UserProfile>(`${environment.apiBaseUrl}/users/me`))
          .then((p) => this.language.applyPreference(p.preferences.language))
          .catch(() => undefined);
      });
    });

    this.language.onUserChange = (language: Locale) => {
      if (this.auth.tenantId()) {
        this.http.patch(`${environment.apiBaseUrl}/users/me`, { language }).subscribe({ error: () => undefined });
      }
    };
  }
}
