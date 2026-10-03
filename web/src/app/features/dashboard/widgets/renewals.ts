import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { DashboardSummary } from '@agency-hub/shared';
import { LanguageService } from '../../../core/i18n/language.service';
import { MoneyPipe, ShortDatePipe, daysUntil } from '../../../shared/pipes/format.pipes';
import { WidgetCard } from '../../../shared/ui/widget-card';
import { blockState, dataOf } from './block-state';

@Component({
  selector: 'ah-renewals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCard, TranslatePipe, MoneyPipe, ShortDatePipe],
  template: `
    <ah-widget-card
      [title]="'widgets.renewals.title' | translate"
      icon="calendar"
      accent="var(--color-accent)"
      [state]="state()"
      [emptyText]="'widgets.renewals.empty' | translate"
    >
      @if (data(); as d) {
        <span slot="badge" class="badge">{{ 'widgets.renewals.window' | translate: { days: d.windowDays } }}</span>
      }
      <ul>
        @for (p of policies(); track p.id) {
          <li>
            <div class="main">
              <strong>{{ p.customerName }}</strong>
              <span class="muted">{{ 'policyTypes.' + p.type | translate }} · {{ p.carrier }}</span>
            </div>
            <div class="side">
              <span class="badge" [class.danger]="p.days <= 7" [class.warning]="p.days > 7 && p.days <= 14">
                {{ (p.days < 0 ? 'widgets.renewals.overdue' : 'widgets.renewals.inDays') | translate: { days: p.days < 0 ? -p.days : p.days } }}
              </span>
              <span class="muted">{{ p.renewalDate | shortDate: language.intlLocale() }} · {{ p.premium | money: language.intlLocale() : currency() }}</span>
            </div>
          </li>
        }
      </ul>
      @if (more(); as m) {
        <p class="more">{{ 'widgets.renewals.more' | translate: { count: m } }}</p>
      }
    </ah-widget-card>
  `,
  styles: `
    :host { display: block; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; justify-content: space-between; gap: 12px; padding-block: 10px; border-block-end: 1px solid var(--color-border); font-size: 0.875rem; }
    li:last-child { border: 0; }
    .main, .side { display: grid; gap: 2px; min-inline-size: 0; }
    .side { justify-items: end; text-align: end; flex-shrink: 0; }
    strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .muted { color: var(--color-muted); font-size: 0.75rem; }
    .more { color: var(--color-muted); font-size: 0.75rem; padding-block-start: 8px; }
  `,
})
export class Renewals {
  protected readonly language = inject(LanguageService);
  readonly block = input<DashboardSummary['renewals']>();
  readonly loading = input(false);
  readonly currency = input('ILS');

  protected readonly data = computed(() => dataOf(this.block()));
  protected readonly state = computed(() => blockState(this.block(), this.loading(), (d) => !d.policies.length));
  protected readonly policies = computed(() =>
    (this.data()?.policies ?? []).slice(0, 6).map((p) => ({ ...p, days: daysUntil(p.renewalDate) })),
  );
  protected readonly more = computed(() => Math.max(0, (this.data()?.policies.length ?? 0) - 6));
}
