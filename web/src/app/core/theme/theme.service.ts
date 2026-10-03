import { DOCUMENT } from '@angular/common';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Locale, TenantBranding } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { safeStorage } from '../storage';

/** Public, pre-login per-company config: `public/tenants/{slug}/theme.config.json`. */
export interface TenantTheme {
  slug: string;
  name: Record<Locale, string>;
  tagline: Record<Locale, string>;
  locales: { default: Locale; supported: Locale[] };
  auth: { google: boolean; usernameLogin: boolean; signup: boolean };
  branding: TenantBranding;
}

const SLUG = /^[a-z0-9-]{2,40}$/;
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'localhost', '127']);

/**
 * White-label theming. Loads the tenant theme before first render and writes it to CSS custom
 * properties on :root, which every LESS token reads. After login the server-side branding
 * (Firestore `tenants/{tid}.branding`) is applied on top via `applyBranding`.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  // HttpBackend skips interceptors: the theme is public and loads before auth exists.
  private readonly http = new HttpClient(inject(HttpBackend));

  readonly theme = signal<TenantTheme | null>(null);
  readonly logoUrl = signal<string>('');

  async init(): Promise<void> {
    const slug = this.resolveSlug();
    let theme = await this.fetchTheme(slug);
    if (!theme && slug !== environment.defaultTenant) theme = await this.fetchTheme(environment.defaultTenant);
    if (!theme) return;
    safeStorage.set('tenant', theme.slug);
    this.theme.set(theme);
    this.applyBranding(theme.branding);
  }

  applyBranding(b: TenantBranding): void {
    const root = this.document.documentElement.style;
    const c = b.colors;
    root.setProperty('--color-primary', c.primary);
    root.setProperty('--color-primary-contrast', contrastText(c.primary));
    root.setProperty('--color-secondary', c.secondary);
    root.setProperty('--color-accent', c.accent);
    root.setProperty('--color-bg', c.bg);
    root.setProperty('--color-surface', c.surface);
    root.setProperty('--color-text', c.text);
    root.setProperty('--font-family', b.font);
    root.setProperty('--radius', b.radius);
    this.logoUrl.set(b.logoUrl);
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.primary);
    if (b.faviconUrl) this.document.querySelector('link[rel="icon"]')?.setAttribute('href', b.faviconUrl);
  }

  /** Subdomain (acme.yourapp.com) → `?tenant=` (dev) → last used → default. */
  private resolveSlug(): string {
    const host = this.document.location.hostname;
    const sub = host.split('.')[0] ?? '';
    const fromHost = host.split('.').length > 2 && !RESERVED_SUBDOMAINS.has(sub) ? sub : null;
    const fromQuery = new URLSearchParams(this.document.location.search).get('tenant');
    const candidate = fromHost ?? fromQuery ?? safeStorage.get('tenant') ?? environment.defaultTenant;
    return SLUG.test(candidate) ? candidate : environment.defaultTenant;
  }

  private async fetchTheme(slug: string): Promise<TenantTheme | null> {
    try {
      return await firstValueFrom(this.http.get<TenantTheme>(`/tenants/${slug}/theme.config.json`));
    } catch {
      return null;
    }
  }
}

/** Black or white text, whichever reads better on the given hex background (WCAG relative luminance). */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.4 ? '#0f172a' : '#ffffff';
}
