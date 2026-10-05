import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import type { Customer360, PolicyDetail } from '@agency-hub/shared';
import { environment } from '../../../environments/environment';
import { LanguageService } from '../../core/i18n/language.service';
import { MoneyPipe, RelativeTimePipe, ShortDatePipe } from '../../shared/pipes/format.pipes';
import { Icon } from '../../shared/ui/icon';
import {
  ageFrom,
  buildTimeline,
  daysFromToday,
  dueState,
  isGap,
  isolateParams,
  maskForDisplay,
  telUrl,
  whatsappUrl,
} from './customer360.util';

const PER_YEAR: Record<PolicyDetail['premium']['frequency'], number> = { monthly: 12, quarterly: 4, yearly: 1 };
const ACTIVE: PolicyDetail['status'][] = ['active', 'pending_renewal'];
const RENEWAL_SOON_DAYS = 30;

/**
 * Customer 360°: profile, policies, claims, family coverage, gaps, tasks and timeline.
 * Layout: main column (policies, claims) + side column (family, gaps, tasks, documents) — grid order
 * mirrors automatically in RTL.
 */
@Component({
  selector: 'ah-customer-360-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, Icon, MoneyPipe, RelativeTimePipe, ShortDatePipe],
  templateUrl: './customer-360.page.html',
  styleUrl: './customer-360.page.less',
})
export class Customer360Page {
  protected readonly language = inject(LanguageService);
  private readonly location = inject(Location);

  /** Route param :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly profile = httpResource<Customer360>(() => ({
    url: `${environment.apiBaseUrl}/customers/${encodeURIComponent(this.id())}/profile`,
    params: { lang: this.language.lang() },
  }));

  protected readonly v = computed(() => (this.profile.hasValue() ? this.profile.value() : null));
  protected readonly notFound = computed(() => (this.profile.error() as HttpErrorResponse | undefined)?.status === 404);

  protected readonly showAllPolicies = signal(false);
  protected readonly revealId = signal(false);

  constructor() {
    // Opening another customer resets per-customer UI state.
    effect(() => {
      this.id();
      this.revealId.set(false);
      this.showAllPolicies.set(false);
    });
  }

  protected readonly c = computed(() => this.v()?.customer ?? null);
  protected readonly age = computed(() => ageFrom(this.c()?.birthDate));
  protected readonly displayId = computed(() => {
    const c = this.c();
    if (!c) return '';
    return c.nationalIdMasked || !this.revealId() ? (c.nationalIdMasked ? c.nationalId : maskForDisplay(c.nationalId)) : c.nationalId;
  });
  protected readonly initials = computed(() =>
    (this.c()?.fullName ?? '')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join(''),
  );
  protected readonly phone = computed(() => this.c()?.phones[0]);
  protected readonly tel = computed(() => (this.phone() ? telUrl(this.phone()!) : null));
  protected readonly whatsapp = computed(() => (this.phone() ? whatsappUrl(this.phone()!) : null));

  protected readonly policies = computed(() => {
    const all = this.v()?.policies ?? [];
    return (this.showAllPolicies() ? all : all.filter((p) => ACTIVE.includes(p.status))).map((p) => {
      const days = p.renewalDate ? daysFromToday(p.renewalDate) : undefined;
      return {
        ...p,
        annual: p.premium.amount * PER_YEAR[p.premium.frequency],
        renewalDays: days,
        renewalSoon: days !== undefined && days >= 0 && days <= RENEWAL_SOON_DAYS,
        paymentProblem: p.payment.status === 'overdue' || p.payment.status === 'failed',
        isActive: ACTIVE.includes(p.status),
      };
    });
  });
  protected readonly inactiveCount = computed(
    () => (this.v()?.policies ?? []).filter((p) => !ACTIVE.includes(p.status)).length,
  );

  protected readonly openClaims = computed(() => (this.v()?.claims ?? []).filter((c) => c.isOpen));
  protected readonly closedClaims = computed(() => (this.v()?.claims ?? []).filter((c) => !c.isOpen));

  /** Family with the product names of the health policies that cover each member. */
  protected readonly family = computed(() => {
    const v = this.v();
    if (!v) return [];
    const byNumber = new Map(v.policies.map((p) => [p.policyNumber, p]));
    return v.family.map((m) => ({
      ...m,
      age: ageFrom(m.birthDate),
      coverage: m.coveredByPolicyNumbers.map((n) => byNumber.get(n)?.productName ?? n),
    }));
  });

  protected readonly gaps = computed(() =>
    (this.v()?.alerts ?? []).filter((a) => isGap(a.kind)).map((a) => ({ ...a, params: isolateParams(a.params) })),
  );
  /**
   * Urgent items only. Renewals, tasks and claim status already show in their own sections, so the strip
   * carries just what needs action today: failed/overdue payments and claims stuck for a long time.
   */
  protected readonly attention = computed(() =>
    (this.v()?.alerts ?? [])
      .filter((a) => a.kind === 'payment_overdue' || a.kind === 'claim_open_long')
      .map((a) => ({ ...a, params: isolateParams(a.params) })),
  );

  protected readonly openTasks = computed(() =>
    (this.v()?.tasks ?? []).filter((t) => t.status === 'open').map((t) => ({ ...t, due: dueState(t.dueAt) })),
  );

  protected readonly timeline = computed(() => (this.v() ? buildTimeline(this.v()!) : []));

  /** MM/YYYY — the format agents use for renewal and consent dates, identical in both languages. */
  protected readonly monthYear = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  /** "Today, 09:14" for today, otherwise relative ("3 days ago"). */
  protected isToday(iso: string): boolean {
    return daysFromToday(iso) === 0;
  }

  protected time(iso: string): string {
    return new Intl.DateTimeFormat(this.language.intlLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  protected back(): void {
    this.location.back();
  }
}
