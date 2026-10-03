import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { DashboardRange, DashboardSummary, DashboardWidgetKey, FeatureKey } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantConfigService } from '../../core/tenant/tenant-config.service';
import { RelativeTimePipe } from '../../shared/pipes/format.pipes';
import { Icon } from '../../shared/ui/icon';
import { ActivityFeed } from './widgets/activity-feed';
import { CrmPipeline } from './widgets/crm-pipeline';
import { IntegrationHealth } from './widgets/integration-health';
import { KpiTiles } from './widgets/kpi-tiles';
import { MessageList } from './widgets/message-list';
import { Renewals } from './widgets/renewals';
import { SheetsLatest } from './widgets/sheets-latest';

const DEFAULT_WIDGETS: DashboardWidgetKey[] = ['kpis', 'crmPipeline', 'whatsapp', 'gmail', 'renewals', 'sheets', 'activity', 'health'];

/** Widget → feature flag(s) it needs. Order and visibility come from tenant settings + flags. */
const WIDGET_FEATURES: Record<DashboardWidgetKey, FeatureKey[]> = {
  kpis: [],
  crmPipeline: ['integration.crm'],
  sheets: ['integration.sheets'],
  gmail: ['integration.gmail'],
  whatsapp: ['integration.whatsapp'],
  renewals: ['integration.crm', 'dashboard.renewals'],
  activity: ['dashboard.activity'],
  health: [],
};

const RANGES: DashboardRange[] = ['7d', '30d', '90d'];

@Component({
  selector: 'ah-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, Icon, RelativeTimePipe, KpiTiles, CrmPipeline, MessageList, Renewals, SheetsLatest, ActivityFeed, IntegrationHealth],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.less',
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly tenantConfig = inject(TenantConfigService);
  protected readonly language = inject(LanguageService);
  protected readonly ranges = RANGES;

  protected readonly range = signal<DashboardRange>('30d');

  protected readonly summary = httpResource<DashboardSummary>(() => ({
    url: `${environment.apiBaseUrl}/dashboard/summary`,
    params: { range: this.range(), lang: this.language.lang() },
  }));

  protected readonly data = computed(() => (this.summary.hasValue() ? this.summary.value() : undefined));
  protected readonly loading = computed(() => this.summary.isLoading());
  protected readonly currency = computed(() => this.data()?.currency ?? 'ILS');

  protected readonly widgets = computed<DashboardWidgetKey[]>(() => {
    const features = this.tenantConfig.features();
    if (!features) return [];
    const order = this.tenantConfig.settings()?.dashboardWidgets ?? DEFAULT_WIDGETS;
    return order.filter((w) => WIDGET_FEATURES[w].every((f) => features[f]));
  });

  protected readonly firstName = computed(() => (this.auth.user()?.displayName ?? '').split(' ')[0]);
}
