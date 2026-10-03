import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { DashboardSummary } from '@agency-hub/shared';
import { LanguageService } from '../../../core/i18n/language.service';
import { RelativeTimePipe } from '../../../shared/pipes/format.pipes';
import { WidgetCard } from '../../../shared/ui/widget-card';
import { blockState, dataOf } from './block-state';

/** Table on tablet+, stacked cards on mobile (same markup, CSS only). */
@Component({
  selector: 'ah-sheets-latest',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCard, TranslatePipe, RelativeTimePipe],
  template: `
    <ah-widget-card [title]="'widgets.sheets.title' | translate" icon="sheet" accent="#0f9d58" [state]="state()">
      @if (data(); as d) {
        <span slot="badge" class="badge">{{ d.sheetName }}</span>
      }
      @if (data(); as d) {
        <table>
          <thead>
            <tr>
              @for (c of d.columns; track c) {
                <th scope="col">{{ c }}</th>
              }
              <th scope="col">{{ 'widgets.sheets.synced' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of d.rows; track row.id) {
              <tr>
                @for (c of d.columns; track c) {
                  <td [attr.data-label]="c" [class.ltr-text]="$index === 1">{{ row.data[c] }}</td>
                }
                <td [attr.data-label]="'widgets.sheets.synced' | translate" class="muted">{{ row.syncedAt | relTime: language.intlLocale() }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </ah-widget-card>
  `,
  styleUrl: './sheets-latest.less',
})
export class SheetsLatest {
  protected readonly language = inject(LanguageService);
  readonly block = input<DashboardSummary['sheets']>();
  readonly loading = input(false);
  protected readonly data = computed(() => dataOf(this.block()));
  protected readonly state = computed(() => blockState(this.block(), this.loading(), (d) => !d.rows.length));
}
