import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import type { FeatureKey } from '@agency-hub/shared';
import { AssistantChatService } from '../../core/assistant/assistant-chat.service';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantConfigService } from '../../core/tenant/tenant-config.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Icon, type IconName } from '../../shared/ui/icon';
import { LanguageSwitch } from '../../shared/ui/language-switch';
import { FeatureDirective } from '../../core/tenant/feature.directive';
import { CustomerSearch } from '../../features/customer360/customer-search';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  feature?: FeatureKey;
}

const NAV: NavItem[] = [
  { path: '/app/dashboard', label: 'nav.dashboard', icon: 'home' },
  { path: '/app/customers', label: 'nav.customers', icon: 'users', feature: 'module.customers' },
  { path: '/app/messages', label: 'nav.messages', icon: 'inbox', feature: 'module.messages' },
  { path: '/app/settings', label: 'nav.settings', icon: 'settings' },
];

/**
 * App frame. Mobile: top bar + bottom tab bar. Tablet (≥768): icon rail, expandable.
 * Desktop (≥1024): full side nav, collapsible. Mirrors automatically in RTL.
 */
@Component({
  selector: 'ah-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, Icon, LanguageSwitch, FeatureDirective, CustomerSearch],
  templateUrl: './shell.html',
  styleUrl: './shell.less',
  host: { '(document:click)': 'onDocumentClick($event)', '(document:keydown.escape)': 'menuOpen.set(false)' },
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  private readonly tenantConfig = inject(TenantConfigService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly navToggled = signal(false);
  protected readonly menuOpen = signal(false);

  protected readonly navItems = computed(() => {
    // Track features so the nav updates when flags load or change.
    this.tenantConfig.features();
    return NAV.filter((i) => !i.feature || this.tenantConfig.isEnabled(i.feature));
  });

  /** Localized name from the theme config when it belongs to this tenant; otherwise the stored name. */
  protected readonly tenantName = computed(() => {
    const tenant = this.tenantConfig.tenant();
    const theme = this.theme.theme();
    if (theme && (!tenant || theme.slug === tenant.slug)) return theme.name[this.language.lang()];
    return tenant?.name ?? '';
  });

  protected readonly initials = computed(() => {
    const name = this.auth.user()?.displayName ?? this.auth.user()?.email ?? '?';
    return name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('');
  });

  constructor() {
    // Staff assistant: only inside the signed-in app; removed again when the shell goes away (logout).
    const assistant = inject(AssistantChatService);
    afterNextRender(() => void assistant.mount());
    inject(DestroyRef).onDestroy(() => assistant.unmount());

    // Close the mobile/tablet overlay nav after navigating.
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => {
        if (!matchMedia('(min-width: 1024px)').matches) this.navToggled.set(false);
        this.menuOpen.set(false);
      });
  }

  protected onDocumentClick(e: MouseEvent): void {
    const menu = (this.host.nativeElement as HTMLElement).querySelector('.user-menu');
    if (menu && !menu.contains(e.target as Node)) this.menuOpen.set(false);
  }
}
