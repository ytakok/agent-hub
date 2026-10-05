import { MockCustomerRecordsProvider } from '../integrations/mock/mock-customer-records.provider.js';
import { buildCustomer360 } from './customer-360.builder.js';
import {
  buildCriteria,
  isValidIsraeliId,
  maskNationalId,
  normalizePhone,
  normalizePolicyNumber,
} from './customer-search.util.js';

const ctx = { tenantId: 't1', locale: 'he' as const };

describe('customer-search.util', () => {
  it('normalizes Israeli phone formats to the same value', () => {
    expect(normalizePhone('+972-52-441-8821')).toBe('0524418821');
    expect(normalizePhone('052 441 8821')).toBe('0524418821');
    expect(normalizePhone('972524418821')).toBe('0524418821');
  });

  it('normalizes policy numbers ignoring case and separators', () => {
    expect(normalizePolicyNumber('hr-hlt 458821')).toBe('HRHLT458821');
  });

  it('validates the Israeli ID check digit and masks IDs', () => {
    expect(isValidIsraeliId('031256787')).toBe(true);
    expect(isValidIsraeliId('031256788')).toBe(false);
    expect(maskNationalId('31256787')).toBe('*****6787');
  });

  it('detects the term type', () => {
    expect(buildCriteria('HR-HLT-458821').searchedBy).toEqual(['policyNumber']);
    expect(buildCriteria('דנה').searchedBy).toEqual(['name']);
    expect(buildCriteria('+972 52 441 8821').searchedBy).toEqual(['phone', 'policyNumber']);
    // 9 digits starting with 0: could be an ID, a landline or a numeric policy number
    expect(buildCriteria('031256787').searchedBy).toEqual(['nationalId', 'phone', 'policyNumber']);
    expect(buildCriteria('100245678').searchedBy).toEqual(['nationalId', 'policyNumber']);
    expect(buildCriteria('12').searchedBy).toEqual([]);
  });

  it('honors an explicit field', () => {
    expect(buildCriteria('0524418821', 'phone')).toEqual({ criteria: { phone: '0524418821' }, searchedBy: ['phone'] });
  });
});

describe('MockCustomerRecordsProvider', () => {
  const provider = new MockCustomerRecordsProvider();
  const find = (q: string) => provider.findCustomers(ctx, buildCriteria(q).criteria, 10);

  it('finds by ID without the leading zero', async () => {
    const [hit] = await find('31256787');
    expect(hit?.customer.id).toBe('crm-1001');
    expect(hit?.matchedOn).toBe('nationalId');
  });

  it("finds the policyholder by a family member's ID", async () => {
    const hits = await find('321098766'); // Ron Cohen, child of crm-1003
    expect(hits.map((h) => h.customer.id)).toContain('crm-1003');
    expect(hits.find((h) => h.customer.id === 'crm-1003')?.matchedFamilyMember).toBe('רון כהן');
  });

  it('finds by phone in any format', async () => {
    const [hit] = await find('052-441-8821');
    expect(hit?.customer.id).toBe('crm-1001');
    expect(hit?.matchedOn).toBe('phone');
  });

  it('finds by policy number, case-insensitive, including numeric ones', async () => {
    expect((await find('cl-car-773410'))[0]?.matchedPolicyNumber).toBe('CL-CAR-773410');
    expect((await find('100245678'))[0]?.customer.id).toBe('crm-1001');
  });

  it('returns nothing for unknown values', async () => {
    expect(await find('999999998')).toEqual([]);
  });

  it('resolves relative dates in the data file', async () => {
    const bundle = await provider.getCustomerBundle(ctx, 'crm-1001');
    expect(bundle?.policies[0]?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('buildCustomer360', () => {
  const provider = new MockCustomerRecordsProvider();
  const build = async (id: string, maskIds = false) =>
    buildCustomer360((await provider.getCustomerBundle(ctx, id))!, { maskIds, renewalWindowDays: 30, system: 'mock' });

  it('summarizes active policies, premium and claims', async () => {
    const v = await build('crm-1001');
    expect(v.summary.activePolicies).toBe(4);
    // 642*12 + 4280 + 118*12 + 96*12
    expect(v.summary.annualPremium).toBe(642 * 12 + 4280 + 118 * 12 + 96 * 12);
    expect(v.summary.openClaims).toBe(1);
    expect(v.summary.closedClaims).toBe(1);
    expect(v.claims[0]?.isOpen).toBe(true);
    expect(v.claims[0]?.policyNumber).toBe('CL-CAR-773410');
  });

  it('maps family health coverage and flags uninsured children', async () => {
    const dana = await build('crm-1001');
    expect(dana.family.find((f) => f.fullName === 'נועה לוי')?.coveredByPolicyNumbers).toEqual(['HR-HLT-458821']);
    const michal = await build('crm-1003');
    expect(michal.alerts.some((a) => a.kind === 'family_uninsured_health' && a.params['name'] === 'רון כהן')).toBe(true);
  });

  it('raises payment, renewal, long-open claim and overdue task alerts, most severe first', async () => {
    const v = await build('crm-1001');
    const kinds = v.alerts.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(['payment_overdue', 'renewal_due', 'claim_open_long', 'task_overdue']));
    expect(v.alerts[0]?.severity).toBe('high');
  });

  it('reports coverage gaps only where cover is missing', async () => {
    const dana = await build('crm-1001');
    expect(dana.alerts.map((a) => a.kind)).toEqual(
      expect.arrayContaining(['coverage_gap_disability', 'coverage_gap_child_accident']),
    );
    const sarah = await build('crm-1005'); // has disability + kids accident policies
    expect(sarah.alerts.some((a) => a.kind.startsWith('coverage_gap'))).toBe(false);
  });

  it('keeps missing claim documents and treats awaiting_documents as open', async () => {
    const [claim] = (await build('crm-1001')).claims;
    expect(claim?.status).toBe('awaiting_documents');
    expect(claim?.isOpen).toBe(true);
    expect(claim?.missingDocuments).toEqual(['דוח שמאי מעודכן']);
  });

  it('masks ID numbers for viewers, including family', async () => {
    const v = await build('crm-1001', true);
    expect(v.customer.nationalId).toBe('*****6787');
    expect(v.customer.nationalIdMasked).toBe(true);
    expect(v.family.every((f) => f.nationalId?.startsWith('*****'))).toBe(true);
  });
});
