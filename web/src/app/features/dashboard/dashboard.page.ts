import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { DashboardRange, DashboardSummary, DashboardWidgetKey } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantConfigService } from '../../core/tenant/tenant-config.service';
import { RouterLink } from '@angular/router';
import { RelativeTimePipe } from '../../shared/pipes/format.pipes';
import { Icon } from '../../shared/ui/icon';
import { ActivityFeed } from './widgets/activity-feed';
import { CrmPipeline } from './widgets/crm-pipeline';
import { IntegrationHealth } from './widgets/integration-health';
import { KpiTiles } from './widgets/kpi-tiles';
import { MessageList } from './widgets/message-list';
import { Renewals } from './widgets/renewals';
import { SheetsLatest } from './widgets/sheets-latest';
import { visibleWidgets } from './widget-registry';

const RANGES: DashboardRange[] = ['7d', '30d', '90d'];

@Component({
  selector: 'ah-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, Icon, RelativeTimePipe, KpiTiles, CrmPipeline, MessageList, Renewals, SheetsLatest, ActivityFeed, IntegrationHealth],
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

  /** Selected in Settings → Organization, in that order, minus widgets the plan does not include. */
  protected readonly widgets = computed<DashboardWidgetKey[]>(() =>
    visibleWidgets(this.tenantConfig.settings()?.dashboardWidgets, this.tenantConfig.features()),
  );
  /** Config loaded but nothing selected — show a pointer to Settings instead of an empty page. */
  protected readonly noWidgets = computed(() => !!this.tenantConfig.config() && this.widgets().length === 0);

  protected readonly firstName = computed(() => (this.auth.user()?.displayName ?? '').split(' ')[0]);
}
