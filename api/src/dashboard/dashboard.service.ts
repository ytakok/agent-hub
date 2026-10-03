import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ActivityItem,
  DashboardRange,
  DashboardSummary,
  DataSource,
  FeatureKey,
  IntegrationHealth,
  Kpi,
  Locale,
  Message,
  SourceBlock,
} from '@agency-hub/shared';
import { TenantConfigService } from '../feature-flags/tenant-config.service.js';
import {
  CRM_PROVIDER,
  GMAIL_PROVIDER,
  SHEETS_PROVIDER,
  WHATSAPP_PROVIDER,
  type CrmProvider,
  type GmailProvider,
  type IntegrationProvider,
  type ProviderContext,
  type SheetsProvider,
  type WhatsAppProvider,
} from '../integrations/provider.types.js';

const DAY = 86_400_000;
const RANGE_DAYS: Record<DashboardRange, number> = { '7d': 7, '30d': 30, '90d': 90 };
const SOURCE_FLAG: Record<DataSource, FeatureKey> = {
  crm: 'integration.crm',
  sheets: 'integration.sheets',
  gmail: 'integration.gmail',
  whatsapp: 'integration.whatsapp',
};
const OPEN: Message['status'][] = ['new', 'assigned'];

/**
 * Builds the dashboard from every source in parallel. A failing or disabled source only
 * affects its own block — the rest of the dashboard still renders.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly tenantConfig: TenantConfigService,
    @Inject(CRM_PROVIDER) private readonly crm: CrmProvider,
    @Inject(SHEETS_PROVIDER) private readonly sheets: SheetsProvider,
    @Inject(GMAIL_PROVIDER) private readonly gmail: GmailProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  async getSummary(tenantId: string, range: DashboardRange, locale: Locale): Promise<DashboardSummary> {
    const { features, settings, tenant } = await this.tenantConfig.getRuntimeConfig(tenantId);
    const ctx: ProviderContext = { tenantId, locale };
    const now = Date.now();
    const generatedAt = new Date(now).toISOString();
    const days = RANGE_DAYS[range];
    const since = new Date(now - days * DAY);
    const prevSince = new Date(now - 2 * days * DAY);
    const slaMs = settings.messageSlaHours * 3_600_000;
    const withSla = (m: Message): Message => ({ ...m, slaDueAt: new Date(new Date(m.receivedAt).getTime() + slaMs).toISOString() });

    const block = async <T>(enabled: boolean, label: string, fn: () => Promise<T>): Promise<SourceBlock<T>> => {
      if (!enabled) return { status: 'disabled' };
      try {
        return { status: 'ok', data: await fn(), lastSyncAt: generatedAt };
      } catch (err) {
        this.logger.warn(`Dashboard source "${label}" failed for tenant ${tenantId}: ${String(err)}`);
        return { status: 'error', error: err instanceof Error ? err.message : 'Source unavailable' };
      }
    };

    const crmOn = features['integration.crm'];
    const [crm, leadCounts, sheets, gmail, whatsapp, renewals, health] = await Promise.all([
      block(crmOn, 'crm', async () => ({
        pipeline: await this.crm.getPipeline(ctx, since),
        recentLeads: await this.crm.getRecentLeads(ctx, 6),
      })),
      block(crmOn, 'crm-kpi', () =>
        Promise.all([this.crm.countNewLeads(ctx, since, new Date(now)), this.crm.countNewLeads(ctx, prevSince, since)]),
      ),
      block(features['integration.sheets'], 'sheets', () => this.sheets.getLatestRows(ctx, 6)),
      block(features['integration.gmail'], 'gmail', async () => {
        const messages = (await this.gmail.listCustomerMessages(ctx, 50)).map(withSla);
        return { unread: messages.filter((m) => m.status === 'new').length, messages: messages.slice(0, 6) };
      }),
      block(features['integration.whatsapp'], 'whatsapp', async () => {
        const messages = (await this.whatsapp.listRequests(ctx, 50)).map(withSla);
        const open = messages.filter((m) => OPEN.includes(m.status));
        return {
          pending: open.length,
          overdue: open.filter((m) => new Date(m.slaDueAt!).getTime() < now).length,
          messages: open.slice(0, 6),
        };
      }),
      block(crmOn && features['dashboard.renewals'], 'renewals', async () => ({
        windowDays: settings.renewalWindowDays,
        policies: await this.crm.getUpcomingRenewals(ctx, settings.renewalWindowDays),
      })),
      this.health(ctx, features),
    ]);

    const kpis: Kpi[] = [];
    if (leadCounts.status === 'ok') {
      const [current, previous] = leadCounts.data;
      kpis.push({ key: 'newLeads', value: current, delta: percentChange(current, previous), format: 'number' });
    }
    const openMessages =
      (gmail.status === 'ok' ? gmail.data.unread : 0) + (whatsapp.status === 'ok' ? whatsapp.data.pending : 0);
    if (gmail.status === 'ok' || whatsapp.status === 'ok') kpis.push({ key: 'openMessages', value: openMessages, format: 'number' });
    if (renewals.status === 'ok') kpis.push({ key: 'renewalsDue', value: renewals.data.policies.length, format: 'number' });
    if (crm.status === 'ok') {
      const open = crm.data.pipeline.filter((p) => p.stage !== 'won' && p.stage !== 'lost');
      kpis.push({ key: 'pipelineValue', value: open.reduce((s, p) => s + p.value, 0), format: 'currency' });
    }
    if (sheets.status === 'ok') kpis.push({ key: 'sheetRows', value: sheets.data.total, format: 'number' });

    const activity: ActivityItem[] = features['dashboard.activity']
      ? [
          ...(crm.status === 'ok'
            ? crm.data.recentLeads.map((l) => ({ id: l.id, source: 'crm' as const, type: 'lead_created' as const, title: l.name, at: l.createdAt }))
            : []),
          ...(gmail.status === 'ok'
            ? gmail.data.messages.map((m) => ({ id: m.id, source: 'gmail' as const, type: 'message_received' as const, title: m.fromName, at: m.receivedAt }))
            : []),
          ...(whatsapp.status === 'ok'
            ? whatsapp.data.messages.map((m) => ({ id: m.id, source: 'whatsapp' as const, type: 'message_received' as const, title: m.fromName, at: m.receivedAt }))
            : []),
          ...(sheets.status === 'ok'
            ? sheets.data.rows.map((r) => ({ id: r.id, source: 'sheets' as const, type: 'row_added' as const, title: String(Object.values(r.data)[0] ?? ''), at: r.syncedAt }))
            : []),
        ]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 12)
      : [];

    return {
      range,
      generatedAt,
      currency: tenant.currency,
      kpis,
      crm,
      sheets: sheets.status === 'ok' ? { ...sheets, data: { sheetName: sheets.data.sheetName, columns: sheets.data.columns, rows: sheets.data.rows } } : sheets,
      gmail,
      whatsapp,
      renewals,
      activity,
      health,
    };
  }

  private health(ctx: ProviderContext, features: Record<FeatureKey, boolean>): Promise<IntegrationHealth[]> {
    const providers: IntegrationProvider[] = [this.crm, this.sheets, this.gmail, this.whatsapp];
    return Promise.all(
      providers.map((p) =>
        features[SOURCE_FLAG[p.source]]
          ? p.health(ctx).catch((): IntegrationHealth => ({ source: p.source, status: 'error' }))
          : Promise.resolve<IntegrationHealth>({ source: p.source, status: 'disabled' }),
      ),
    );
  }
}

export function percentChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current === 0 ? 0 : undefined;
  return Math.round(((current - previous) / previous) * 100);
}
