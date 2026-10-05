import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import type { CustomerSearchHit, CustomerSearchResponse } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { LanguageService } from '../../core/i18n/language.service';
import { debouncedSignal } from '../../shared/debounced-signal';
import { Icon } from '../../shared/ui/icon';

const MIN_CHARS = 2;

/**
 * Global customer search (top bar, every page): ID, phone, policy number or name.
 * Desktop: inline combobox. Mobile: icon that opens a full-width search over the top bar.
 * Shortcuts: Ctrl/⌘+K or "/" to focus, ↑/↓ to move, Enter to open, Esc to close.
 */
@Component({
  selector: 'ah-customer-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, Icon],
  templateUrl: './customer-search.html',
  styleUrl: './customer-search.less',
  host: {
    '[class.open]': 'mobileOpen()',
    '(document:keydown)': 'onGlobalKey($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class CustomerSearch {
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly language = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly term = signal('');
  protected readonly focused = signal(false);
  protected readonly mobileOpen = signal(false);
  protected readonly active = signal(-1);
  private readonly query = debouncedSignal(computed(() => this.term().trim()), 300);

  /** POST keeps ID/phone numbers out of URLs and server access logs. Undefined → no request. */
  protected readonly results = httpResource<CustomerSearchResponse>(() => {
    const q = this.query();
    if (q.length < MIN_CHARS) return undefined;
    return {
      url: `${environment.apiBaseUrl}/customers/search`,
      method: 'POST',
      params: { lang: this.language.lang() },
      body: { q },
    };
  });

  protected readonly hits = computed<CustomerSearchHit[]>(() =>
    this.results.hasValue() && this.query().length >= MIN_CHARS ? this.results.value().hits : [],
  );
  protected readonly typing = computed(() => this.term().trim() !== this.query());
  protected readonly loading = computed(() => this.typing() || this.results.isLoading());
  protected readonly showPanel = computed(() => (this.focused() || this.mobileOpen()) && this.term().trim().length > 0);
  protected readonly tooShort = computed(() => this.term().trim().length < MIN_CHARS);

  protected onInput(value: string): void {
    this.term.set(value);
    this.active.set(-1);
  }

  protected onKey(e: KeyboardEvent): void {
    const hits = this.hits();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.active.set(hits.length ? (this.active() + 1) % hits.length : -1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.active.set(hits.length ? (this.active() - 1 + hits.length) % hits.length : -1);
    } else if (e.key === 'Enter') {
      const hit = hits[this.active()] ?? (hits.length === 1 ? hits[0] : undefined);
      if (hit) this.select(hit);
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  protected onGlobalKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const inField = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !inField)) {
      e.preventDefault();
      this.openMobile();
    }
  }

  protected onDocumentClick(e: MouseEvent): void {
    if (!(this.host.nativeElement as HTMLElement).contains(e.target as Node)) {
      this.focused.set(false);
      this.mobileOpen.set(false);
    }
  }

  protected openMobile(): void {
    this.mobileOpen.set(true);
    // Focus after the render that makes the box visible — focusing a display:none input is a no-op.
    afterNextRender(() => this.input().nativeElement.focus(), { injector: this.injector });
  }

  protected select(hit: CustomerSearchHit): void {
    void this.router.navigate(['/app/customers', hit.customerId]);
    this.close(true);
  }

  protected close(clear = false): void {
    if (clear) this.term.set('');
    this.active.set(-1);
    this.mobileOpen.set(false);
    this.focused.set(false);
    this.input().nativeElement.blur();
  }

  protected optionId(i: number): string {
    return `cs-opt-${i}`;
  }
}
