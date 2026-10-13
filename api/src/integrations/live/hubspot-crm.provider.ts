import { Injectable, Logger } from '@nestjs/common';
import type { Customer, IntegrationHealth, Paginated } from '@agency-hub/shared';
import { AppConfig } from '../../config/app-config.service.js';
import { MockCrmProvider } from '../mock/mock-providers.js';
import type { CrmProvider, PageQuery, ProviderContext } from '../provider.types.js';

const HS_CONTACTS = 'https://api.hubapi.com/crm/v3/objects/contacts';
const PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'lifecyclestage', 'lastmodifieddate', 'notes_last_contacted'];
const CACHE_MS = 60_000;
const MAX_PAGES = 50; // 50 x 100 = 5,000 contacts safety cap

interface HubSpotContact {
  id: string;
  properties: Record<string, string | null | undefined>;
}

interface HubSpotPage {
  results: HubSpotContact[];
  paging?: { next?: { after?: string } };
}

/**
 * CRM provider backed by HubSpot contacts.
 *
 * Only `listCustomers` reads real HubSpot data. Pipeline, leads, renewals and health still come from
 * the mock provider until they are implemented against HubSpot deals / an agency-management system.
 *
 * NOTE: one HUBSPOT_ACCESS_TOKEN serves every tenant. Fine while you are the only tenant; later,
 * look the token up by ctx.tenantId (Firestore / secret manager).
 */
@Injectable()
export class HubSpotCrmProvider implements CrmProvider {
  readonly source = 'crm' as const;
  private readonly logger = new Logger(HubSpotCrmProvider.name);
  private readonly cache = new Map<string, { at: number; items: Promise<Customer[]> }>();

  constructor(
    private readonly config: AppConfig,
    private readonly fallback: MockCrmProvider,
  ) {}

  // ---- Real HubSpot data ----

  async listCustomers(ctx: ProviderContext, { page, pageSize, search }: PageQuery): Promise<Paginated<Customer>> {
    const all = await this.loadCustomers(ctx.tenantId);
    const q = search?.trim().toLowerCase();
    const filtered = q
      ? all.filter((c) => c.fullName.toLowerCase().includes(q) || c.phones.some((p) => p.includes(q)) || c.emails.some((e) => e.toLowerCase().includes(q)))
      : all;
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: filtered.length };
  }

  // ---- Still mock (delegated) ----

  health(ctx: ProviderContext): Promise<IntegrationHealth> {
    return this.fallback.health(ctx);
  }
  getPipeline(ctx: ProviderContext, since: Date) {
    return this.fallback.getPipeline(ctx, since);
  }
  getRecentLeads(ctx: ProviderContext, limit: number) {
    return this.fallback.getRecentLeads(ctx, limit);
  }
  countNewLeads(ctx: ProviderContext, from: Date, to: Date) {
    return this.fallback.countNewLeads(ctx, from, to);
  }
  getUpcomingRenewals(ctx: ProviderContext, windowDays: number) {
    return this.fallback.getUpcomingRenewals(ctx, windowDays);
  }

  // ---- Internals ----

  private loadCustomers(tenantId: string): Promise<Customer[]> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

    const items = this.fetchAll();
    this.cache.set(tenantId, { at: Date.now(), items });
    // Don't cache failures.
    items.catch(() => this.cache.delete(tenantId));
    return items;
  }

  private async fetchAll(): Promise<Customer[]> {
    const token = this.config.get('HUBSPOT_ACCESS_TOKEN');
    if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set');

    const contacts: HubSpotContact[] = [];
    let after: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const url = new URL(HS_CONTACTS);
      url.searchParams.set('limit', '100');
      url.searchParams.set('properties', PROPERTIES.join(','));
      if (after) url.searchParams.set('after', after);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        this.logger.warn(`HubSpot responded ${res.status}`);
        throw new Error(`HubSpot request failed (${res.status})`);
      }
      const body = (await res.json()) as HubSpotPage;
      contacts.push(...body.results);
      after = body.paging?.next?.after;
      if (!after) break;
    }

    return contacts
      .map(toCustomer)
      .sort((a, b) => Date.parse(b.lastContactAt ?? '') - Date.parse(a.lastContactAt ?? ''));
  }
}

function toCustomer(c: HubSpotContact): Customer {
  const p = c.properties;
  const fullName = [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || p.email || '—';
  const phones = [p.phone, p.mobilephone].filter((x): x is string => Boolean(x));
  const emails = p.email ? [p.email] : [];
  const lastContactAt = p.notes_last_contacted || p.lastmodifieddate || new Date(0).toISOString();

  // Adjust the mapping to your HubSpot lifecycle stages if needed.
  const status = p.lifecyclestage === 'customer' ? 'active' : 'lead';

  return { id: c.id, fullName, phones, emails, status, lastContactAt } as Customer;
}
