import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { Customer, Paginated } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { LanguageService } from '../../core/i18n/language.service';
import { RelativeTimePipe } from '../../shared/pipes/format.pipes';
import { Icon } from '../../shared/ui/icon';
import { debouncedSignal } from '../../shared/debounced-signal';

@Component({
  selector: 'ah-customers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RelativeTimePipe, Icon],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'customers.title' | translate }}</h1>
        @if (result(); as r) {
          <p>{{ 'customers.count' | translate: { count: r.total } }}</p>
        }
      </div>
      <label class="search">
        <ah-icon name="search" [size]="18" />
        <span class="visually-hidden">{{ 'common.search' | translate }}</span>
        <input class="input" type="search" [placeholder]="'common.search' | translate" (input)="onSearch($any($event.target).value)" />
      </label>
    </header>

    @if (customers.error()) {
      <div class="alert error" role="alert">{{ 'common.sourceError' | translate }}</div>
    }

    <ul class="list" [attr.aria-busy]="customers.isLoading()">
      @for (c of result()?.items ?? []; track c.id) {
        <li>
          <span class="avatar" aria-hidden="true">{{ c.fullName.charAt(0) }}</span>
          <div class="main">
            <strong>{{ c.fullName }}</strong>
            <span class="muted ltr-text">{{ c.phones[0] }} · {{ c.emails[0] }}</span>
          </div>
          <div class="side">
            <span class="badge" [class.success]="c.status === 'active'" [class.primary]="c.status === 'lead'">{{ 'customerStatus.' + c.status | translate }}</span>
            <span class="muted">{{ c.lastContactAt | relTime: language.intlLocale() }}</span>
          </div>
        </li>
      } @empty {
        @if (!customers.isLoading()) {
          <li class="empty">{{ 'common.empty' | translate }}</li>
        }
      }
    </ul>

    @if (pages() > 1) {
      <nav class="pager" [attr.aria-label]="'common.pagination' | translate">
        <!-- ‹ › are bidi-mirrored characters, so they point the right way in RTL automatically. -->
        <button class="btn ghost" (click)="page.set(page() - 1)" [disabled]="page() === 1" [attr.aria-label]="'common.previous' | translate">‹</button>
        <span>{{ page() }} / {{ pages() }}</span>
        <button class="btn ghost" (click)="page.set(page() + 1)" [disabled]="page() >= pages()" [attr.aria-label]="'common.next' | translate">›</button>
      </nav>
    }
  `,
  styleUrl: '../../shared/list-page.less',
})
export class CustomersPage {
  protected readonly language = inject(LanguageService);
  protected readonly search = signal('');
  private readonly debounced = debouncedSignal(this.search, 300);
  protected readonly page = signal(1);

  protected readonly customers = httpResource<Paginated<Customer>>(() => ({
    url: `${environment.apiBaseUrl}/customers`,
    params: { page: this.page(), pageSize: 20, lang: this.language.lang(), ...(this.debounced() ? { search: this.debounced() } : {}) },
  }));
  protected readonly result = computed(() => (this.customers.hasValue() ? this.customers.value() : null));
  protected readonly pages = computed(() => Math.ceil((this.result()?.total ?? 0) / 20));

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }
}
