import type {
  Claim,
  ClaimStatus,
  Customer360,
  CustomerAlert,
  FamilyMember,
  PolicyDetail,
} from '@agency-hub/shared';
import type { CustomerBundle } from '../integrations/provider.types.js';
import { maskNationalId } from './customer-search.util.js';

const DAY = 86_400_000;
const ACTIVE: PolicyDetail['status'][] = ['active', 'pending_renewal'];
const OPEN_CLAIM: ClaimStatus[] = ['open', 'awaiting_documents', 'in_review', 'approved'];
const COVERED_TYPES: PolicyDetail['type'][] = ['health'];
const PER_YEAR: Record<PolicyDetail['premium']['frequency'], number> = { monthly: 12, quarterly: 4, yearly: 1 };
const SEVERITY_ORDER: Record<CustomerAlert['severity'], number> = { high: 0, medium: 1, low: 2 };
const POLICY_STATUS_ORDER: Record<PolicyDetail['status'], number> = {
  pending_renewal: 0,
  active: 1,
  suspended: 2,
  expired: 3,
  cancelled: 4,
};

export interface BuildOptions {
  /** Viewers get masked ID numbers. */
  maskIds: boolean;
  renewalWindowDays: number;
  system: string;
  now?: number;
}

/**
 * Turns raw CRM records into the 360° view: masking, family health coverage, summary and alerts.
 * Pure — the same logic applies whichever system the records came from.
 */
export function buildCustomer360(bundle: CustomerBundle, opts: BuildOptions): Customer360 {
  const now = opts.now ?? Date.now();
  const daysFrom = (iso: string) => Math.round((new Date(iso).getTime() - now) / DAY);

  const policies = [...bundle.policies].sort(
    (a, b) => POLICY_STATUS_ORDER[a.status] - POLICY_STATUS_ORDER[b.status] || (a.renewalDate ?? a.endDate).localeCompare(b.renewalDate ?? b.endDate),
  );
  const active = policies.filter((p) => ACTIVE.includes(p.status));
  const byId = new Map(policies.map((p) => [p.id, p]));

  const claims: Claim[] = bundle.claims
    .map((c) => {
      const policy = byId.get(c.policyId);
      return {
        ...c,
        policyNumber: policy?.policyNumber ?? '',
        type: policy?.type ?? 'business',
        isOpen: OPEN_CLAIM.includes(c.status),
      };
    })
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || b.openedAt.localeCompare(a.openedAt));

  // Which active health policies cover each family member.
  const healthCover = (memberId: string) =>
    active.filter((p) => COVERED_TYPES.includes(p.type) && p.insuredMemberIds.includes(memberId)).map((p) => p.policyNumber);

  const family: FamilyMember[] = bundle.customer.family.map((m) => ({
    ...m,
    nationalId: opts.maskIds ? maskNationalId(m.nationalId) : m.nationalId,
    coveredByPolicyNumbers: healthCover(m.id),
  }));

  const alerts: CustomerAlert[] = [];
  for (const p of policies) {
    if (ACTIVE.includes(p.status) && (p.payment.status === 'overdue' || p.payment.status === 'failed')) {
      alerts.push({
        kind: 'payment_overdue',
        severity: 'high',
        params: { policyNumber: p.policyNumber, days: p.payment.nextDueAt ? Math.max(0, -daysFrom(p.payment.nextDueAt)) : 0 },
      });
    }
    if (ACTIVE.includes(p.status) && p.renewalDate) {
      const days = daysFrom(p.renewalDate);
      if (days >= 0 && days <= opts.renewalWindowDays) {
        alerts.push({ kind: 'renewal_due', severity: days <= 14 ? 'high' : 'medium', params: { policyNumber: p.policyNumber, days } });
      }
    }
    if (p.status === 'expired' && daysFrom(p.endDate) >= -90) {
      alerts.push({ kind: 'policy_expired', severity: 'low', params: { policyNumber: p.policyNumber, days: -daysFrom(p.endDate) } });
    }
  }
  for (const c of claims) {
    const days = -daysFrom(c.openedAt);
    if (c.isOpen && days > 30) alerts.push({ kind: 'claim_open_long', severity: 'medium', params: { claimNumber: c.claimNumber, days } });
  }
  for (const m of family) {
    if ((m.relation === 'spouse' || m.relation === 'child') && !m.customerId && !m.coveredByPolicyNumbers.length) {
      alerts.push({ kind: 'family_uninsured_health', severity: 'medium', params: { name: m.fullName } });
    }
  }
  // Coverage gaps (cross-sell): only for active customers.
  if (bundle.customer.status === 'active') {
    const age = ageAt(bundle.customer.birthDate, now);
    if (age !== undefined && age >= 18 && age <= 67 && !active.some((p) => p.type === 'disability')) {
      alerts.push({ kind: 'coverage_gap_disability', severity: 'medium', params: {} });
    }
    const minors = family.filter((m) => m.relation === 'child' && (ageAt(m.birthDate, now) ?? 99) < 18);
    const accidentCovered = (memberId: string) =>
      active.some((p) => p.type === 'personal_accident' && p.insuredMemberIds.includes(memberId));
    const uncovered = minors.filter((m) => !accidentCovered(m.id));
    if (uncovered.length) {
      alerts.push({ kind: 'coverage_gap_child_accident', severity: 'low', params: { count: uncovered.length } });
    }
  }
  if (!bundle.customer.consent.marketing && !bundle.customer.consent.updatedAt) {
    alerts.push({ kind: 'consent_missing', severity: 'low', params: {} });
  }
  for (const t of bundle.tasks) {
    if (t.status === 'open' && t.dueAt && daysFrom(t.dueAt) < 0) {
      alerts.push({ kind: 'task_overdue', severity: 'medium', params: { title: t.title, days: -daysFrom(t.dueAt) } });
    }
  }
  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const c = bundle.customer;
  return {
    customer: {
      id: c.id,
      nationalId: opts.maskIds ? maskNationalId(c.nationalId) : c.nationalId,
      nationalIdMasked: opts.maskIds,
      fullName: c.fullName,
      birthDate: c.birthDate,
      gender: c.gender,
      phones: c.phones,
      emails: c.emails,
      address: c.address,
      status: c.status,
      tags: c.tags,
      assignedAgent: c.assignedAgent,
      preferredChannel: c.preferredChannel,
      consent: c.consent,
      customerSince: c.customerSince,
    },
    summary: {
      activePolicies: active.length,
      annualPremium: Math.round(active.reduce((s, p) => s + p.premium.amount * PER_YEAR[p.premium.frequency], 0)),
      currency: policies[0]?.premium.currency ?? 'ILS',
      openClaims: claims.filter((x) => x.isOpen).length,
      closedClaims: claims.filter((x) => !x.isOpen).length,
      familyMembers: family.length,
    },
    alerts,
    policies,
    claims,
    family,
    interactions: [...bundle.interactions].sort((a, b) => b.at.localeCompare(a.at)),
    documents: [...bundle.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    tasks: [...bundle.tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.dueAt ?? '').localeCompare(b.dueAt ?? '')),
    source: { system: opts.system, fetchedAt: new Date(now).toISOString() },
  };
}

function ageAt(birthDate: string | undefined, now: number): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(birthDate);
  const n = new Date(now);
  let age = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
