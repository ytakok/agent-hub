import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { Kpi } from '@agency-hub/shared';
import { LanguageService } from '../../../core/i18n/language.service';
import { MoneyPipe, NumberPipe } from '../../../shared/pipes/format.pipes';
import { Icon, type IconName } from '../../../shared/ui/icon';

const ICON: Record<Kpi['key'], IconName> = {
  newLeads: 'users',
  openMessages: 'inbox',
  renewalsDue: 'calendar',
  pipelineValue: 'crm',
  sheetRows: 'sheet',
};

@Component({
  selector: 'ah-kpi-tiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MoneyPipe, NumberPipe, Icon],
  template: `
    @if (loading() && !kpis().length) {
      @for (i of [1, 2, 3, 4]; track i) {
        <div class="tile skeleton" aria-hidden="true"></div>
      }
    } @else {
      @for (k of kpis(); track k.key) {
        <div class="tile">
          <div class="head">
            <span>{{ 'kpi.' + k.key | translate }}</span>
            <ah-icon [name]="icon[k.key]" [size]="18" />
          </div>
          <strong>
            @if (k.format === 'currency') {
              {{ k.value | money: language.intlLocale() : currency() }}
            } @else {
              {{ k.value | num: language.intlLocale() }}
            }
          </strong>
          @if (k.delta !== undefined && k.delta !== null) {
            <span class="delta" [class.up]="k.delta > 0" [class.down]="k.delta < 0">
              <ah-icon [name]="k.delta >= 0 ? 'arrowUp' : 'arrowDown'" [size]="14" />
              <span class="ltr-text">{{ k.delta > 0 ? '+' : '' }}{{ k.delta }}%</span>
              <span class="muted">{{ 'kpi.vsPrevious' | translate }}</span>
            </span>
          }
        </div>
      }
    }
  `,
  styleUrl: './kpi-tiles.less',
})
export class KpiTiles {
  protected readonly language = inject(LanguageService);
  protected readonly icon = ICON;
  readonly kpis = input.required<Kpi[]>();
  readonly currency = input('ILS');
  readonly loading = input(false);
}
