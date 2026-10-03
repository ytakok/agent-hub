import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { ActivityItem, DataSource } from '@agency-hub/shared';
import { LanguageService } from '../../../core/i18n/language.service';
import { RelativeTimePipe } from '../../../shared/pipes/format.pipes';
import { Icon, type IconName } from '../../../shared/ui/icon';
import { WidgetCard } from '../../../shared/ui/widget-card';

const SOURCE: Record<DataSource, { icon: IconName; color: string }> = {
  crm: { icon: 'crm', color: 'var(--color-primary)' },
  sheets: { icon: 'sheet', color: '#0f9d58' },
  gmail: { icon: 'mail', color: '#ea4335' },
  whatsapp: { icon: 'whatsapp', color: '#25d366' },
};

@Component({
  selector: 'ah-activity-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCard, TranslatePipe, RelativeTimePipe, Icon],
  template: `
    <ah-widget-card [title]="'widgets.activity.title' | translate" icon="activity" [state]="state()">
      <ol>
        @for (a of items(); track a.source + a.id) {
          <li>
            <span class="dot" [style.color]="source[a.source].color"><ah-icon [name]="source[a.source].icon" [size]="16" /></span>
            <div>
              <span>{{ 'activity.' + a.type | translate: { name: a.title } }}</span>
              <time [attr.datetime]="a.at">{{ a.at | relTime: language.intlLocale() }}</time>
            </div>
          </li>
        }
      </ol>
    </ah-widget-card>
  `,
  styles: `
    :host { display: block; }
    ol { list-style: none; margin: 0; padding: 0; position: relative; }
    li { display: flex; gap: 12px; padding-block: 8px; font-size: 0.875rem; position: relative; }
    li:not(:last-child)::after { content: ''; position: absolute; inset-inline-start: 15px; inset-block: 40px -8px; inline-size: 2px; background: var(--color-border); }
    .dot { display: grid; place-items: center; inline-size: 32px; block-size: 32px; flex-shrink: 0; border-radius: 50%; background: color-mix(in srgb, currentColor 12%, transparent); }
    div { display: grid; min-inline-size: 0; }
    time { color: var(--color-muted); font-size: 0.75rem; }
  `,
})
export class ActivityFeed {
  protected readonly language = inject(LanguageService);
  protected readonly source = SOURCE;
  readonly items = input<ActivityItem[]>([]);
  readonly loading = input(false);
  protected readonly state = computed(() => (this.loading() && !this.items().length ? 'loading' : this.items().length ? 'ready' : 'empty'));
}
