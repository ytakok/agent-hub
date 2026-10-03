import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Locale } from '@agency-hub/shared';
import { LANGUAGE_LABELS, LanguageService } from '../../core/i18n/language.service';
import { Icon } from './icon';

/** Two languages → one toggle button; more → a select. */
@Component({
  selector: 'ah-language-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (language.supported().length === 2) {
      <button type="button" class="btn ghost" (click)="language.use(other())" [attr.lang]="other()">
        <ah-icon name="globe" [size]="18" /><span class="label">{{ labels[other()] }}</span>
      </button>
    } @else {
      <label class="visually-hidden" for="lang-select">Language</label>
      <select id="lang-select" class="input" [value]="language.lang()" (change)="pick($event)">
        @for (l of language.supported(); track l) {
          <option [value]="l" [attr.lang]="l">{{ labels[l] }}</option>
        }
      </select>
    }
  `,
  styles: `
    .btn { min-block-size: 40px; padding-inline: 10px; }
    @media (max-width: 575px) { .label { display: none; } }
  `,
})
export class LanguageSwitch {
  protected readonly language = inject(LanguageService);
  protected readonly labels = LANGUAGE_LABELS;
  protected readonly other = computed<Locale>(() => this.language.supported().find((l) => l !== this.language.lang()) ?? 'en');

  protected pick(e: Event): void {
    void this.language.use((e.target as HTMLSelectElement).value as Locale);
  }
}
