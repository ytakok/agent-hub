import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { LanguageSwitch } from '../../shared/ui/language-switch';

/** Mobile: single centered card. Desktop: brand panel + form side by side (mirrors in RTL). */
@Component({
  selector: 'ah-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, LanguageSwitch],
  template: `
    <aside class="brand-panel" aria-hidden="true">
      <div class="brand-content">
        @if (theme.logoUrl()) {
          <img [src]="theme.logoUrl()" alt="" width="64" height="64" />
        }
        <h2>{{ name() }}</h2>
        <p>{{ tagline() }}</p>
      </div>
    </aside>
    <section class="form-panel">
      <div class="top">
        <div class="mobile-brand">
          @if (theme.logoUrl()) {
            <img [src]="theme.logoUrl()" alt="" width="36" height="36" />
          }
          <strong>{{ name() }}</strong>
        </div>
        <ah-language-switch />
      </div>
      <div class="card">
        <router-outlet />
      </div>
    </section>
  `,
  styleUrl: './auth-layout.less',
})
export class AuthLayout {
  protected readonly theme = inject(ThemeService);
  private readonly language = inject(LanguageService);
  protected readonly name = computed(() => this.theme.theme()?.name[this.language.lang()] ?? '');
  protected readonly tagline = computed(() => this.theme.theme()?.tagline[this.language.lang()] ?? '');
}
