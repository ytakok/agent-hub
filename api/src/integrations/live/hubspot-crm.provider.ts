import { Injectable, Logger } from '@nestjs/common';
import type { Customer, IntegrationHealth, Lead, LeadStage, Paginated, PipelineStage } from '@agency-hub/shared';
import { AppConfig } from '../../config/app-config.service.js';
import { MockCrmProvider } from '../mock/mock-providers.js';
import type { CrmProvider, PageQuery, ProviderContext } from '../provider.types.js';

const HS_API = 'https://api.hubapi.com';
const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'lifecyclestage', 'lastmodifieddate', 'notes_last_contacted'];
const DEAL_PROPERTIES = ['dealname', 'amount', 'dealstage', 'pipeline', 'createdate', 'closedate'];
const CACHE_MS = 60_000;
const MAX_PAGES = 50; // 50 x 100 = 5,000 records safety cap
/** Open HubSpot stages are spread over these buckets in board order (won/lost come from stage metadata). */
const OPEN_BUCKETS: LeadStage[] = ['new', 'contacted', 'quoted', 'negotiation'];

interface HubSpotObject {
  id: string;
  properties: Record<string, string | null | undefined>;
}

interface HubSpotPage {
  results: HubSpotObject[];
  paging?: { next?: { after?: string } };
}

interface HubSpotPipeline {
  id: string;
  label: string;
  displayOrder: number;
  stages: { id: string; label: string; displayOrder: number; archived?: boolean; metadata?: { isClosed?: string; probability?: string } }[];
}

/** A HubSpot deal stage, normalized. */
interface DealStage {
  id: string;
  label: string;
  bucket: LeadStage;
  closed: boolean;
}

interface Deal {
  id: string;
  name: string;
  amount: number;
  stageId: string;
  createdAt: string;
  closedAt?: string;
}

interface DealBoard {
  pipelineLabel: string;
  stages: DealStage[];
  deals: Deal[];
  fetchedAt: string;
}

/**
 * CRM provider backed by HubSpot.
 *
 * - Customers  → HubSpot contacts.
 * - Pipeline, recent leads, new-lead KPI → HubSpot deals in one deal pipeline (the Deals board),
 *   using your real stage names and board order.
 * - Renewals still come from the mock provider (HubSpot has no policy object).
 *
 * NOTE: one HUBSPOT_ACCESS_TOKEN serves every tenant. Fine while you are the only tenant; later,
 * look the token up by ctx.tenantId (Firestore / secret manager).
 */
@Injectable()
export class HubSpotCrmProvider implements CrmProvider {
  readonly source = 'crm' as const;
  private readonly logger = new Logger(HubSpotCrmProvider.name);
  private readonly cache = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    private readonly config: AppConfig,
    private readonly fallback: MockCrmProvider,
  ) {}

  // ---- Contacts ----

  async listCustomers(ctx: ProviderContext, { page, pageSize, search }: PageQuery): Promise<Paginated<Customer>> {
    const all = await this.cached(`contacts:${ctx.tenantId}`, () => this.fetchCustomers());
    const q = search?.trim().toLowerCase();
    const filtered = q
      ? all.filter((c) => c.fullName.toLowerCase().includes(q) || c.phones.some((p) => p.includes(q)) || c.emails.some((e) => e.toLowerCase().includes(q)))
      : all;
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: filtered.length };
  }

  // ---- Deals ----

  /**
   * One bar per stage, in board order. Open stages show every deal currently in them (like the board);
   * closed stages (won / lost) show only deals closed within the selected range.
   */
  async getPipeline(ctx: ProviderContext, since: Date): Promise<PipelineStage[]> {
    const { stages, deals } = await this.board(ctx);
    const from = since.getTime();
    return stages.map((s) => {
      const inStage = deals.filter(
        (d) => d.stageId === s.id && (!s.closed || Date.parse(d.closedAt ?? d.createdAt) >= from),
      );
      return { stage: s.bucket, label: s.label, count: inStage.length, value: inStage.reduce((sum, d) => sum + d.amount, 0) };
    });
  }

  async getRecentLeads(ctx: ProviderContext, limit: number): Promise<Lead[]> {
    const { stages, deals } = await this.board(ctx);
    const byId = new Map(stages.map((s) => [s.id, s]));
    return [...deals]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit)
      .map((d) => {
        const stage = byId.get(d.stageId);
        return {
          id: d.id,
          name: d.name,
          phone: '',
          source: 'hubspot',
          stage: stage?.bucket ?? 'new',
          stageLabel: stage?.label,
          value: d.amount,
          createdAt: d.createdAt,
        };
      });
  }

  async countNewLeads(ctx: ProviderContext, from: Date, to: Date): Promise<number> {
    const { deals } = await this.board(ctx);
    const a = from.getTime();
    const b = to.getTime();
    return deals.filter((d) => {
      const t = Date.parse(d.createdAt);
      return t >= a && t < b;
    }).length;
  }

  async health(ctx: ProviderContext): Promise<IntegrationHealth> {
    try {
      const { deals, fetchedAt } = await this.board(ctx);
      return { source: this.source, status: 'connected', lastSyncAt: fetchedAt, itemsLastSync: deals.length };
    } catch {
      return { source: this.source, status: 'error' };
    }
  }

  // ---- Still mock (delegated) ----

  getUpcomingRenewals(ctx: ProviderContext, windowDays: number) {
    return this.fallback.getUpcomingRenewals(ctx, windowDays);
  }

  // ---- Internals ----

  private board(ctx: ProviderContext): Promise<DealBoard> {
    return this.cached(`deals:${ctx.tenantId}`, () => this.fetchBoard());
  }

  /** Caches a promise per key for CACHE_MS; failures are not cached. */
  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { at: Date.now(), value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  private token(): string {
    const token = this.config.get('HUBSPOT_ACCESS_TOKEN');
    if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set');
    return token;
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, HS_API);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token()}` } });
    if (!res.ok) {
      // 403 here usually means the private app is missing a scope (e.g. crm.objects.deals.read).
      this.logger.warn(`HubSpot ${url.pathname} responded ${res.status}`);
      throw new Error(`HubSpot request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  private async getAll(path: string, properties: string[]): Promise<HubSpotObject[]> {
    const out: HubSpotObject[] = [];
    let after: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const params: Record<string, string> = { limit: '100', properties: properties.join(',') };
      if (after) params['after'] = after;
      const body = await this.get<HubSpotPage>(path, params);
      out.push(...body.results);
      after = body.paging?.next?.after;
      if (!after) break;
    }
    return out;
  }

  private async fetchCustomers(): Promise<Customer[]> {
    const contacts = await this.getAll('/crm/v3/objects/contacts', CONTACT_PROPERTIES);
    return contacts.map(toCustomer).sort((a, b) => Date.parse(b.lastContactAt ?? '') - Date.parse(a.lastContactAt ?? ''));
  }

  private async fetchBoard(): Promise<DealBoard> {
    const [{ results: pipelines }, rawDeals] = await Promise.all([
      this.get<{ results: HubSpotPipeline[] }>('/crm/v3/pipelines/deals'),
      this.getAll('/crm/v3/objects/deals', DEAL_PROPERTIES),
    ]);

    const wanted = this.config.get('HUBSPOT_DEAL_PIPELINE_ID');
    const sorted = [...pipelines].sort((a, b) => a.displayOrder - b.displayOrder);
    const pipeline = sorted.find((p) => p.id === wanted) ?? sorted.find((p) => p.id === 'default') ?? sorted[0];
    if (!pipeline) throw new Error('HubSpot has no deal pipelines');
    if (wanted && pipeline.id !== wanted) this.logger.warn(`HUBSPOT_DEAL_PIPELINE_ID "${wanted}" not found; using "${pipeline.label}"`);

    const stages = toStages(pipeline);
    const stageIds = new Set(stages.map((s) => s.id));
    const deals = rawDeals
      .filter((d) => d.properties['pipeline'] === pipeline.id && stageIds.has(d.properties['dealstage'] ?? ''))
      .map(toDeal);

    return { pipelineLabel: pipeline.label, stages, deals, fetchedAt: new Date().toISOString() };
  }
}

function toStages(pipeline: HubSpotPipeline): DealStage[] {
  const live = pipeline.stages.filter((s) => !s.archived).sort((a, b) => a.displayOrder - b.displayOrder);
  const openCount = live.filter((s) => s.metadata?.isClosed !== 'true').length;
  let openIndex = 0;
  return live.map((s) => {
    const closed = s.metadata?.isClosed === 'true';
    let bucket: LeadStage;
    if (closed) {
      bucket = Number(s.metadata?.probability ?? 0) >= 1 ? 'won' : 'lost';
    } else {
      // Spread open stages evenly over new → negotiation, keeping board order.
      bucket = OPEN_BUCKETS[Math.min(OPEN_BUCKETS.length - 1, Math.floor((openIndex++ * OPEN_BUCKETS.length) / Math.max(1, openCount)))]!;
    }
    return { id: s.id, label: s.label, bucket, closed };
  });
}

function toDeal(d: HubSpotObject): Deal {
  const p = d.properties;
  const amount = Number(p['amount']);
  return {
    id: d.id,
    name: p['dealname']?.trim() || `#${d.id}`,
    amount: Number.isFinite(amount) ? amount : 0,
    stageId: p['dealstage'] ?? '',
    createdAt: p['createdate'] || new Date(0).toISOString(),
    closedAt: p['closedate'] || undefined,
  };
}

function toCustomer(c: HubSpotObject): Customer {
  const p = c.properties;
  const fullName = [p['firstname'], p['lastname']].filter(Boolean).join(' ').trim() || p['email'] || '—';
  const phones = [p['phone'], p['mobilephone']].filter((x): x is string => Boolean(x));
  const emails = p['email'] ? [p['email']] : [];
  const lastContactAt = p['notes_last_contacted'] || p['lastmodifieddate'] || new Date(0).toISOString();

  // Adjust the mapping to your HubSpot lifecycle stages if needed.
  const status = p['lifecyclestage'] === 'customer' ? 'active' : 'lead';

  return { id: c.id, fullName, phones, emails, status, lastContactAt } as Customer;
}
