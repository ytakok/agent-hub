import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { Direction, Locale } from '@agency-hub/shared';
import { safeStorage } from '../storage';

const RTL: ReadonlySet<Locale> = new Set<Locale>(['he']);
export const LANGUAGE_LABELS: Record<Locale, string> = { he: 'עברית', en: 'English' };

/**
 * Current language + direction. Switching sets <html lang dir>, which flips the whole layout
 * (all styles use logical properties) — no per-component RTL code needed.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  readonly lang = signal<Locale>('he');
  readonly supported = signal<Locale[]>(['he', 'en']);
  readonly dir = computed<Direction>(() => (RTL.has(this.lang()) ? 'rtl' : 'ltr'));
  readonly isRtl = computed(() => this.dir() === 'rtl');
  /** BCP-47 tag for Intl formatters. */
  readonly intlLocale = computed(() => (this.lang() === 'he' ? 'he-IL' : 'en-US'));

  /** Listeners (e.g. profile sync) can react to user-initiated changes. */
  onUserChange?: (lang: Locale) => void;

  async init(supported: Locale[], tenantDefault: Locale): Promise<void> {
    this.supported.set(supported);
    const stored = safeStorage.get('lang') as Locale | null;
    const browser = navigator.language.slice(0, 2) as Locale;
    const initial = [stored, tenantDefault, browser].find((l): l is Locale => !!l && supported.includes(l)) ?? supported[0]!;
    this.translate.addLangs(supported);
    await this.apply(initial);
  }

  async use(lang: Locale): Promise<void> {
    if (lang === this.lang() || !this.supported().includes(lang)) return;
    await this.apply(lang);
    safeStorage.set('lang', lang);
    this.onUserChange?.(lang);
  }

  /** Apply a saved profile preference without echoing it back to the server. */
  async applyPreference(lang: Locale): Promise<void> {
    if (lang !== this.lang() && this.supported().includes(lang)) {
      await this.apply(lang);
      safeStorage.set('lang', lang);
    }
  }

  private async apply(lang: Locale): Promise<void> {
    await firstValueFrom(this.translate.use(lang));
    this.lang.set(lang);
    const html = this.document.documentElement;
    html.lang = lang;
    html.dir = this.dir();
  }
}
