import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { DataSource, IntegrationHealth as Health } from '@agency-hub/shared';
import { LanguageService } from '../../../core/i18n/language.service';
import { RelativeTimePipe } from '../../../shared/pipes/format.pipes';
import { Icon, type IconName } from '../../../shared/ui/icon';
import { WidgetCard } from '../../../shared/ui/widget-card';

const ICON: Record<DataSource, IconName> = { crm: 'crm', sheets: 'sheet', gmail: 'mail', whatsapp: 'whatsapp' };

@Component({
  selector: 'ah-integration-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCard, TranslatePipe, RelativeTimePipe, Icon],
  template: `
    <ah-widget-card [title]="'widgets.health.title' | translate" icon="shield" [state]="state()">
      <ul>
        @for (h of items(); track h.source) {
          <li>
            <ah-icon [name]="icon[h.source]" [size]="18" />
            <span class="name">{{ 'sources.' + h.source | translate }}</span>
            <span
              class="badge"
              [class.success]="h.status === 'connected'"
              [class.primary]="h.status === 'mock'"
              [class.danger]="h.status === 'error'"
              >{{ 'health.' + h.status | translate }}</span
            >
            @if (h.lastSyncAt) {
              <time class="muted">{{ h.lastSyncAt | relTime: language.intlLocale() }}</time>
            }
          </li>
        }
      </ul>
    </ah-widget-card>
  `,
  styles: `
    :host { display: block; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    li { display: flex; align-items: center; gap: 8px; min-block-size: 40px; font-size: 0.875rem; }
    .name { flex: 1; }
    .muted { color: var(--color-muted); font-size: 0.75rem; min-inline-size: 64px; text-align: end; }
  `,
})
export class IntegrationHealth {
  protected readonly language = inject(LanguageService);
  protected readonly icon = ICON;
  readonly items = input<Health[]>([]);
  readonly loading = input(false);
  protected readonly state = computed(() => (this.loading() && !this.items().length ? 'loading' : 'ready'));
}
