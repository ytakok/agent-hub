import type { Customer360, CustomerAlertKind, CoverageGapKind } from '@agency-hub/shared';

const DAY = 86_400_000;

/**
 * Unicode isolates for values interpolated into translated sentences. Without them, codes like
 * "CL-CLM-2026-08812" or "#48213" inside a Hebrew sentence can render with punctuation on the wrong side.
 */
export const ltr = (s: string) => `⁦${s}⁩`; // LEFT-TO-RIGHT ISOLATE … POP
export const auto = (s: string) => `⁨${s}⁩`; // FIRST-STRONG ISOLATE … POP (free text, either language)

/** Isolates identifier params in alert messages; claim numbers get their "#" inside the isolate. */
export function isolateParams(params: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'claimNumber') out[k] = ltr(`#${v}`);
    else if (k === 'policyNumber') out[k] = ltr(String(v));
    else if (typeof v === 'string') out[k] = auto(v);
    else out[k] = v;
  }
  return out;
}

export const GAP_KINDS: readonly CoverageGapKind[] = ['family_uninsured_health', 'coverage_gap_disability', 'coverage_gap_child_accident'];

export function isGap(kind: CustomerAlertKind): kind is CoverageGapKind {
  return (GAP_KINDS as readonly string[]).includes(kind);
}

/** Whole calendar days from today (negative = past). */
export function daysFromToday(iso: string, now = Date.now()): number {
  const start = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((start(new Date(iso).getTime()) - start(now)) / DAY);
}

export function ageFrom(birthDate: string | undefined, now = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(birthDate);
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

/** Display mask like the CRM: first digit, bullets, last two ("0••••••87"). */
export function maskForDisplay(id: string): string {
  return id.length < 4 ? id : `${id[0]}${'•'.repeat(id.length - 3)}${id.slice(-2)}`;
}

/** wa.me link from an Israeli number in any format. */
export function whatsappUrl(phone: string): string {
  const d = phone.replace(/\D/g, '');
  const intl = d.startsWith('972') ? d : d.startsWith('0') ? `972${d.slice(1)}` : d;
  return `https://wa.me/${intl}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export type DueState = 'overdue' | 'today' | 'week' | 'later';

export function dueState(iso: string | undefined): DueState {
  if (!iso) return 'later';
  const d = daysFromToday(iso);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  return d <= 7 ? 'week' : 'later';
}

export type TimelineTone = 'message' | 'call' | 'claim' | 'doc' | 'done';

export interface TimelineItem {
  id: string;
  at: string;
  tone: TimelineTone;
  /** i18n key under customer360.timeline.* and its params. */
  key: string;
  params: Record<string, string>;
}

/** One chronological feed from interactions, documents and claim events. Newest first. */
export function buildTimeline(v: Customer360, limit = 12): TimelineItem[] {
  const items: TimelineItem[] = [
    ...v.interactions.map<TimelineItem>((i) => ({
      id: `int-${i.id}`,
      at: i.at,
      tone: i.channel === 'phone' || i.channel === 'meeting' ? 'call' : 'message',
      key: `interaction.${i.channel}`,
      params: { summary: auto(i.summary) },
    })),
    ...v.documents.map<TimelineItem>((d) => ({
      id: `doc-${d.id}`,
      at: d.uploadedAt,
      tone: 'doc',
      key: 'document',
      params: { name: auto(d.name) },
    })),
    ...v.claims.flatMap<TimelineItem>((c) => [
      { id: `clo-${c.id}`, at: c.openedAt, tone: 'claim', key: 'claimOpened', params: { claim: ltr(`#${c.claimNumber}`) } },
      ...(c.closedAt
        ? [{ id: `clc-${c.id}`, at: c.closedAt, tone: 'done' as const, key: 'claimClosed', params: { claim: ltr(`#${c.claimNumber}`) } }]
        : []),
    ]),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
