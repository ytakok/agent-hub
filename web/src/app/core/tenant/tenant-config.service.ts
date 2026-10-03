import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { FeatureKey, TenantRuntimeConfig, TenantSettings } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ThemeService } from '../theme/theme.service';

/**
 * The signed-in organization's runtime config: branding, resolved feature flags and settings
 * (`GET /api/tenants/current/config`, built from Firestore). Reloads whenever the tenant changes.
 * The server enforces flags too — hiding UI here is UX, not security.
 */
@Injectable({ providedIn: 'root' })
export class TenantConfigService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  readonly config = signal<TenantRuntimeConfig | null>(null);
  readonly features = computed(() => this.config()?.features ?? null);
  readonly settings = computed<TenantSettings | null>(() => this.config()?.settings ?? null);
  readonly tenant = computed(() => this.config()?.tenant ?? null);

  private loading: Promise<TenantRuntimeConfig | null> | null = null;

  constructor() {
    effect(() => {
      const tenantId = this.auth.tenantId();
      untracked(() => {
        this.loading = null;
        if (tenantId) void this.load();
        else this.config.set(null);
      });
    });
  }

  isEnabled(key: FeatureKey): boolean {
    return this.features()?.[key] ?? false;
  }

  /** Loads once per tenant; concurrent callers share the request. */
  load(force = false): Promise<TenantRuntimeConfig | null> {
    if (!force && this.config()?.tenant.id === this.auth.tenantId()) return Promise.resolve(this.config());
    this.loading ??= firstValueFrom(this.http.get<TenantRuntimeConfig>(`${environment.apiBaseUrl}/tenants/current/config`))
      .then((cfg) => {
        this.set(cfg);
        return cfg;
      })
      .catch(() => {
        this.loading = null;
        return null;
      });
    return this.loading;
  }

  set(cfg: TenantRuntimeConfig): void {
    this.config.set(cfg);
    this.theme.applyBranding(cfg.tenant.branding);
  }
}
