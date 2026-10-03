import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Icon, type IconName } from './icon';

export type WidgetState = 'loading' | 'error' | 'empty' | 'ready';

/** Common frame for every dashboard widget: header, and loading / error / empty / content states. */
@Component({
  selector: 'ah-widget-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, TranslatePipe],
  template: `
    <header>
      <span class="icon" [style.color]="accent()"><ah-icon [name]="icon()" /></span>
      <h2>{{ title() }}</h2>
      <ng-content select="[slot=badge]" />
    </header>
    <div class="body" [attr.aria-busy]="state() === 'loading'">
      @switch (state()) {
        @case ('loading') {
          <div class="skeleton" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <span></span>
            }
          </div>
          <span class="visually-hidden">{{ 'common.loading' | translate }}</span>
        }
        @case ('error') {
          <p class="state error"><ah-icon name="alert" /> {{ errorText() || ('common.sourceError' | translate) }}</p>
        }
        @case ('empty') {
          <p class="state">{{ emptyText() || ('common.empty' | translate) }}</p>
        }
        @default {
          <ng-content />
        }
      }
    </div>
  `,
  styleUrl: './widget-card.less',
})
export class WidgetCard {
  readonly title = input.required<string>();
  readonly icon = input.required<IconName>();
  readonly accent = input<string>('var(--color-primary)');
  readonly state = input<WidgetState>('ready');
  readonly errorText = input<string>('');
  readonly emptyText = input<string>('');
}
