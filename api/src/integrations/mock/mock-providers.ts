import { Injectable } from '@nestjs/common';
import type { Customer, DataSource, IntegrationHealth, LeadStage, Message, Paginated, Policy } from '@agency-hub/shared';
import type {
  CrmProvider,
  GmailProvider,
  PageQuery,
  ProviderContext,
  SheetsProvider,
  WhatsAppProvider,
} from '../provider.types.js';
import { MockDatasetService } from './mock-dataset.service.js';

const DAY = 86_400_000;
const STAGES: LeadStage[] = ['new', 'contacted', 'quoted', 'negotiation', 'won', 'lost'];

// @Injectable on the base class emits the constructor metadata Nest needs to inject the dataset into subclasses.
@Injectable()
abstract class MockBase {
  abstract readonly source: DataSource;
  constructor(protected readonly data: MockDatasetService) {}

  async health(_ctx: ProviderContext): Promise<IntegrationHealth> {
    return { source: this.source, status: 'mock', lastSyncAt: new Date(Date.now() - 4 * 60_000).toISOString(), itemsLastSync: 12 };
  }
}

@Injectable()
export class MockCrmProvider extends MockBase implements CrmProvider {
  readonly source = 'crm' as const;

  async getPipeline(ctx: ProviderContext, since: Date) {
    const leads = this.data.get(ctx.tenantId, ctx.locale).leads.filter((l) => new Date(l.createdAt) >= since);
    return STAGES.map((stage) => {
      const inStage = leads.filter((l) => l.stage === stage);
      return { stage, count: inStage.length, value: inStage.reduce((s, l) => s + l.value, 0) };
    });
  }

  async getRecentLeads(ctx: ProviderContext, limit: number) {
    return this.data.get(ctx.tenantId, ctx.locale).leads.slice(0, limit);
  }

  async countNewLeads(ctx: ProviderContext, from: Date, to: Date) {
    return this.data
      .get(ctx.tenantId, ctx.locale)
      .leads.filter((l) => new Date(l.createdAt) >= from && new Date(l.createdAt) < to).length;
  }

  async listCustomers(ctx: ProviderContext, { page, pageSize, search }: PageQuery): Promise<Paginated<Customer>> {
    const q = search?.trim().toLowerCase();
    const all = this.data
      .get(ctx.tenantId, ctx.locale)
      .customers.filter((c) => !q || c.fullName.toLowerCase().includes(q) || c.phones.some((p) => p.includes(q)) || c.emails.some((e) => e.includes(q)));
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  }

  async getUpcomingRenewals(ctx: ProviderContext, windowDays: number): Promise<Policy[]> {
    const until = Date.now() + windowDays * DAY;
    return this.data
      .get(ctx.tenantId, ctx.locale)
      .policies.filter((p) => p.status !== 'cancelled' && new Date(p.renewalDate).getTime() <= until && new Date(p.renewalDate).getTime() >= Date.now() - 7 * DAY)
      .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate));
  }
}

@Injectable()
export class MockSheetsProvider extends MockBase implements SheetsProvider {
  readonly source = 'sheets' as const;

  async getLatestRows(ctx: ProviderContext, limit: number) {
    const { sheet } = this.data.get(ctx.tenantId, ctx.locale);
    return { ...sheet, rows: sheet.rows.slice(0, limit), total: sheet.rows.length };
  }
}

@Injectable()
export class MockGmailProvider extends MockBase implements GmailProvider {
  readonly source = 'gmail' as const;

  async listCustomerMessages(ctx: ProviderContext, limit: number): Promise<Message[]> {
    return this.data.get(ctx.tenantId, ctx.locale).emails.slice(0, limit);
  }
}

@Injectable()
export class MockWhatsAppProvider extends MockBase implements WhatsAppProvider {
  readonly source = 'whatsapp' as const;

  async listRequests(ctx: ProviderContext, limit: number): Promise<Message[]> {
    return this.data.get(ctx.tenantId, ctx.locale).whatsapp.slice(0, limit);
  }
}
