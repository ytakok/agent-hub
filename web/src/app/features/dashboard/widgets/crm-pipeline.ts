import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { DashboardSummary } from '@agency-hub/shared';
import { LanguageService } from '../../../core/i18n/language.service';
import { TenantConfigService } from '../../../core/tenant/tenant-config.service';
import { MoneyPipe, RelativeTimePipe } from '../../../shared/pipes/format.pipes';
import { WidgetCard } from '../../../shared/ui/widget-card';
import { blockState, dataOf } from './block-state';

@Component({
  selector: 'ah-crm-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCard, NgxEchartsDirective, TranslatePipe, MoneyPipe, RelativeTimePipe],
  template: `
    <ah-widget-card [title]="'widgets.crm.title' | translate" icon="crm" [state]="state()">
      @if (data(); as d) {
        <div echarts class="chart" [options]="options()" [autoResize]="true" role="img" [attr.aria-label]="'widgets.crm.chartLabel' | translate"></div>
        <h3>{{ 'widgets.crm.recentLeads' | translate }}</h3>
        <ul>
          @for (lead of d.recentLeads.slice(0, 4); track lead.id) {
            <li>
              <span class="name">{{ lead.name }}</span>
              <span class="badge">{{ 'stages.' + lead.stage | translate }}</span>
              <span class="value">{{ lead.value | money: language.intlLocale() : currency() }}</span>
              <time class="time">{{ lead.createdAt | relTime: language.intlLocale() }}</time>
            </li>
          }
        </ul>
      }
    </ah-widget-card>
  `,
  styles: `
    :host { display: block; }
    .chart { block-size: 220px; inline-size: 100%; }
    h3 { font-size: 0.875rem; font-weight: 600; margin-block: 12px 4px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding-block: 8px; border-block-end: 1px solid var(--color-border); font-size: 0.875rem; }
    li:last-child { border: 0; }
    .name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .value, .time { color: var(--color-muted); font-size: 0.75rem; }
    .time { text-align: end; }
  `,
})
export class CrmPipeline {
  protected readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly tenantConfig = inject(TenantConfigService);
  private readonly document = inject(DOCUMENT);

  readonly block = input<DashboardSummary['crm']>();
  readonly loading = input(false);
  readonly currency = input('ILS');

  protected readonly data = computed(() => dataOf(this.block()));
  protected readonly state = computed(() => blockState(this.block(), this.loading(), (d) => d.pipeline.every((p) => !p.count)));

  protected readonly options = computed<EChartsCoreOption>(() => {
    const pipeline = this.data()?.pipeline ?? [];
    const rtl = this.language.isRtl();
    this.language.lang(); // re-translate on language change
    this.tenantConfig.config(); // re-read brand colors after branding loads
    const css = getComputedStyle(this.document.documentElement);
    const primary = css.getPropertyValue('--color-primary').trim() || '#1f5eff';
    const muted = css.getPropertyValue('--color-text').trim() || '#0f172a';
    const font = css.getPropertyValue('--font-family').trim();

    return {
      textStyle: { fontFamily: font },
      grid: { top: 8, bottom: 8, left: 8, right: 16, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      // RTL: value axis grows right→left and category labels sit on the right.
      xAxis: {
        type: 'value',
        inverse: rtl,
        // Headroom so the value label at the end of the longest bar isn't clipped.
        max: (v: { max: number }) => Math.max(1, Math.ceil(v.max * 1.15)),
        minInterval: 1,
        splitLine: { lineStyle: { opacity: 0.3 } },
        axisLabel: { color: muted },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        position: rtl ? 'right' : 'left',
        data: pipeline.map((p) => this.translate.instant(`stages.${p.stage}`)),
        axisLabel: { color: muted },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          name: this.translate.instant('widgets.crm.leads'),
          data: pipeline.map((p) => p.count),
          barMaxWidth: 18,
          itemStyle: { color: primary, borderRadius: rtl ? [4, 0, 0, 4] : [0, 4, 4, 0] },
          label: { show: true, position: rtl ? 'left' : 'right', color: muted },
        },
      ],
    };
  });
}
