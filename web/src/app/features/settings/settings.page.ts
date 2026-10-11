import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { DashboardRange, DashboardWidgetKey, FeatureKey, Locale, TenantRuntimeConfig, UserProfile } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { AuthService, authErrorKey } from '../../core/auth/auth.service';
import { LANGUAGE_LABELS, LanguageService } from '../../core/i18n/language.service';
import { TenantConfigService } from '../../core/tenant/tenant-config.service';
import { UserSettingsService } from '../../core/user-settings/user-settings.service';
import { Icon } from '../../shared/ui/icon';
import { matchFields, strongPassword } from '../auth/password';
import { DASHBOARD_WIDGETS, isWidgetAvailable, visibleWidgets } from '../dashboard/widget-registry';
import { FeatureDirective } from '../../core/tenant/feature.directive';
import { SheetsConnection } from './sheets-connection';

@Component({
  selector: 'ah-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Icon, FeatureDirective, SheetsConnection],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.less',
})
export class SettingsPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly tenantConfig = inject(TenantConfigService);
  protected readonly language = inject(LanguageService);
  private readonly userSettings = inject(UserSettingsService);
  private readonly api = environment.apiBaseUrl;

  /** Same registry the dashboard renders from; unavailable = the plan does not include the widget's feature. */
  protected readonly widgetOptions = computed(() =>
    DASHBOARD_WIDGETS.map((key) => ({ key, available: isWidgetAvailable(key, this.tenantConfig.features()) })),
  );
  protected readonly languageLabels = LANGUAGE_LABELS;
  protected readonly ranges: DashboardRange[] = ['7d', '30d', '90d'];
  /** Personal choice is limited to the widgets the organization shows. */
  protected readonly myWidgetOptions = computed(() =>
    visibleWidgets(this.tenantConfig.settings()?.dashboardWidgets, this.tenantConfig.features()),
  );
  protected readonly canEditOrg = computed(() => ['owner', 'admin'].includes(this.auth.role() ?? ''));
  protected readonly hasPassword = computed(() => this.auth.user()?.providerData.some((p) => p.providerId === 'password') ?? false);
  protected readonly flags = computed(() =>
    Object.entries(this.tenantConfig.features() ?? {}).map(([key, on]) => ({ key: key as FeatureKey, on })),
  );

  protected readonly message = signal<{ type: 'success' | 'error'; key: string; section: string } | null>(null);
  protected readonly busy = signal<string | null>(null);

  protected readonly profileForm = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    phone: ['', Validators.pattern(/^\+?[0-9 -]{7,20}$/)],
  });

  protected readonly orgForm = this.fb.group({
    renewalWindowDays: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
    messageSlaHours: [4, [Validators.required, Validators.min(1), Validators.max(168)]],
    dashboardWidgets: [[] as DashboardWidgetKey[]],
  });

  /** Personal preferences, saved to `userSettings/{uid}`. */
  protected readonly prefsForm = this.fb.group({
    language: ['he' as Locale],
    defaultRange: ['30d' as DashboardRange],
    hiddenWidgets: [[] as DashboardWidgetKey[]],
  });

  protected readonly passwordForm = this.fb.group(
    { current: ['', Validators.required], password: ['', [Validators.required, strongPassword]], confirm: ['', Validators.required] },
    { validators: matchFields('password', 'confirm') },
  );

  constructor() {
    firstValueFrom(this.http.get<UserProfile>(`${this.api}/users/me`))
      .then((p) => this.profileForm.patchValue({ displayName: p.displayName, phone: p.phone ?? '' }))
      .catch(() => undefined);

    effect(() => {
      const s = this.userSettings.settings();
      if (s) this.prefsForm.reset({ language: s.language, defaultRange: s.dashboard.defaultRange, hiddenWidgets: [...s.dashboard.hiddenWidgets] });
    });

    effect(() => {
      const s = this.tenantConfig.settings();
      if (s) this.orgForm.reset({ renewalWindowDays: s.renewalWindowDays, messageSlaHours: s.messageSlaHours, dashboardWidgets: [...s.dashboardWidgets] });
      if (this.canEditOrg()) this.orgForm.enable();
      else this.orgForm.disable();
    });
  }

  protected toggleWidget(w: DashboardWidgetKey, checked: boolean): void {
    const current = this.orgForm.controls.dashboardWidgets.value;
    this.orgForm.controls.dashboardWidgets.setValue(checked ? DASHBOARD_WIDGETS.filter((x) => x === w || current.includes(x)) : current.filter((x) => x !== w));
    this.orgForm.markAsDirty();
  }

  protected toggleMyWidget(w: DashboardWidgetKey, shown: boolean): void {
    const hidden = this.prefsForm.controls.hiddenWidgets.value;
    this.prefsForm.controls.hiddenWidgets.setValue(shown ? hidden.filter((x) => x !== w) : [...hidden, w]);
    this.prefsForm.markAsDirty();
  }

  protected savePrefs(): Promise<void> {
    return this.run('prefs', async () => {
      const v = this.prefsForm.getRawValue();
      const saved = await this.userSettings.update({
        language: v.language,
        dashboard: { defaultRange: v.defaultRange, hiddenWidgets: v.hiddenWidgets },
      });
      await this.language.applyPreference(saved.language);
    });
  }

  protected saveProfile(): Promise<void> {
    return this.run('profile', async () => {
      const v = this.profileForm.getRawValue();
      await firstValueFrom(this.http.patch(`${this.api}/users/me`, { displayName: v.displayName, ...(v.phone ? { phone: v.phone } : {}) }));
    });
  }

  protected saveOrg(): Promise<void> {
    return this.run('org', async () => {
      const cfg = await firstValueFrom(this.http.patch<TenantRuntimeConfig>(`${this.api}/tenants/current/settings`, this.orgForm.getRawValue()));
      this.tenantConfig.set(cfg);
    });
  }

  /** Platform admins only — the API rejects everyone else. */
  protected toggleFlag(key: FeatureKey, on: boolean): Promise<void> {
    const tenantId = this.tenantConfig.tenant()?.id;
    if (!tenantId) return Promise.resolve();
    return this.run('flags', async () => {
      const cfg = await firstValueFrom(
        this.http.patch<TenantRuntimeConfig>(`${this.api}/tenants/${tenantId}/features`, { overrides: { [key]: on } }),
      );
      this.tenantConfig.set(cfg);
    });
  }

  protected changePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return Promise.resolve();
    }
    return this.run('password', async () => {
      const v = this.passwordForm.getRawValue();
      await this.auth.changePassword(v.current, v.password);
      this.passwordForm.reset();
    });
  }

  private async run(section: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(section);
    this.message.set(null);
    try {
      await action();
      this.message.set({ type: 'success', key: 'settings.saved', section });
    } catch (e) {
      this.message.set({ type: 'error', key: section === 'password' ? authErrorKey(e) : 'settings.saveError', section });
    } finally {
      this.busy.set(null);
    }
  }
}
