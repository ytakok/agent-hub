import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { PolicyDetail } from '@agency-hub/shared';
import {
  normalizeName,
  normalizeNationalId,
  normalizePhone,
  normalizePolicyNumber,
} from '../../customer-360/customer-search.util.js';
import type {
  CustomerBundle,
  CustomerCriteria,
  CustomerMatch,
  CustomerRecord,
  CustomerRecordsProvider,
  ProviderContext,
} from '../provider.types.js';

/** Same relative depth from src/ and dist/, so this resolves to api/mock-data in both. */
const DATA_FILE = new URL('../../../mock-data/crm-customers.json', import.meta.url);
const DAY = 86_400_000;
const ACTIVE: PolicyDetail['status'][] = ['active', 'pending_renewal'];

interface MockCrmFile {
  system: string;
  customers: CustomerRecord[];
  policies: (PolicyDetail & { customerId: string })[];
  claims: (CustomerBundle['claims'][number] & { customerId: string })[];
  interactions: (CustomerBundle['interactions'][number] & { customerId: string })[];
  documents: (CustomerBundle['documents'][number] & { customerId: string })[];
  tasks: (CustomerBundle['tasks'][number] & { customerId: string })[];
}

/**
 * Mock CRM backed by `api/mock-data/crm-customers.json`. The same records are served to every tenant.
 * Relative dates in the file ("+18d", "-45d") are resolved against today, once per day.
 */
@Injectable()
export class MockCustomerRecordsProvider implements CustomerRecordsProvider {
  private readonly logger = new Logger(MockCustomerRecordsProvider.name);
  private raw: MockCrmFile | null = null;
  private cache: { day: number; data: MockCrmFile } | null = null;

  get system(): string {
    return this.data().system;
  }

  async findCustomers(_ctx: ProviderContext, c: CustomerCriteria, limit: number): Promise<CustomerMatch[]> {
    const data = this.data();
    const matches: CustomerMatch[] = [];
    const activeCount = (customerId: string) =>
      data.policies.filter((p) => p.customerId === customerId && ACTIVE.includes(p.status)).length;
    const push = (customer: CustomerRecord, m: Omit<CustomerMatch, 'customer' | 'activePolicies'>) => {
      if (!matches.some((x) => x.customer.id === customer.id)) {
        matches.push({ customer, activePolicies: activeCount(customer.id), ...m });
      }
    };

    // Most specific first: ID, then policy number, phone, name.
    if (c.nationalId) {
      for (const cust of data.customers) {
        if (normalizeNationalId(cust.nationalId) === c.nationalId) push(cust, { matchedOn: 'nationalId' });
      }
      // A family member's ID finds the policyholder(s) they are listed under.
      for (const cust of data.customers) {
        const member = cust.family.find((f) => f.nationalId && normalizeNationalId(f.nationalId) === c.nationalId);
        if (member && !member.customerId) push(cust, { matchedOn: 'nationalId', matchedFamilyMember: member.fullName });
      }
    }
    if (c.policyNumber) {
      for (const p of data.policies) {
        if (normalizePolicyNumber(p.policyNumber) !== c.policyNumber) continue;
        const cust = data.customers.find((x) => x.id === p.customerId);
        if (cust) push(cust, { matchedOn: 'policyNumber', matchedPolicyNumber: p.policyNumber });
      }
    }
    if (c.phone) {
      for (const cust of data.customers) {
        if (cust.phones.some((ph) => normalizePhone(ph) === c.phone)) push(cust, { matchedOn: 'phone' });
      }
    }
    if (c.name && c.name.length >= 2) {
      for (const cust of data.customers) {
        if (normalizeName(cust.fullName).includes(c.name)) push(cust, { matchedOn: 'name' });
      }
    }
    return matches.slice(0, limit);
  }

  async getCustomerBundle(_ctx: ProviderContext, customerId: string): Promise<CustomerBundle | null> {
    const data = this.data();
    const customer = data.customers.find((x) => x.id === customerId);
    if (!customer) return null;
    // Records keep their customerId on the way out; extra fields are harmless to consumers.
    const own = <T extends { customerId: string }>(rows: T[]): T[] => rows.filter((r) => r.customerId === customerId);
    return {
      customer,
      policies: own(data.policies),
      claims: own(data.claims),
      interactions: own(data.interactions),
      documents: own(data.documents),
      tasks: own(data.tasks),
    };
  }

  private data(): MockCrmFile {
    const day = Math.floor(Date.now() / DAY);
    if (this.cache?.day === day) return this.cache.data;
    if (!this.raw) {
      this.raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as MockCrmFile;
      this.logger.log(`Loaded ${this.raw.customers.length} mock CRM customers from ${DATA_FILE.pathname}`);
    }
    const data = resolveDates(structuredClone(this.raw), day * DAY) as MockCrmFile;
    this.cache = { day, data };
    return data;
  }
}

/** "+18d" / "-45d" → ISO date relative to `today`; "2024-05-01" → ISO. Other strings untouched. */
function resolveDates(value: unknown, today: number): unknown {
  if (typeof value === 'string') {
    const rel = /^([+-])(\d+)d$/.exec(value);
    if (rel) return new Date(today + (rel[1] === '-' ? -1 : 1) * Number(rel[2]) * DAY + 9 * 3_600_000).toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`).toISOString();
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveDates(v, today));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) (value as Record<string, unknown>)[k] = resolveDates(v, today);
  }
  return value;
}
