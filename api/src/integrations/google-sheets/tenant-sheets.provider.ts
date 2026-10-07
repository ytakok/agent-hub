import { Injectable } from '@nestjs/common';
import type { IntegrationHealth } from '@agency-hub/shared';
import { AppConfig } from '../../config/app-config.service.js';
import { LiveSheetsProvider } from '../live/live-providers.js';
import { MockSheetsProvider } from '../mock/mock-providers.js';
import type { ProviderContext, SheetsProvider } from '../provider.types.js';
import { SheetsIntegrationService } from './sheets-integration.service.js';

/**
 * Per-tenant source selection for Sheets: a tenant with a connected sheet always gets live data,
 * regardless of DATA_MODE; everyone else keeps the DATA_MODE default (mock data, or "not connected").
 * This lets one agency go live without switching the other integrations off mock.
 */
@Injectable()
export class TenantSheetsProvider implements SheetsProvider {
  readonly source = 'sheets' as const;

  constructor(
    private readonly sheets: SheetsIntegrationService,
    private readonly config: AppConfig,
    private readonly mock: MockSheetsProvider,
    private readonly notConnected: LiveSheetsProvider,
  ) {}

  private get fallback(): SheetsProvider {
    return this.config.isMock ? this.mock : this.notConnected;
  }

  async getLatestRows(ctx: ProviderContext, limit: number) {
    if (!(await this.sheets.getConfig(ctx.tenantId))) return this.fallback.getLatestRows(ctx, limit);
    const data = await this.sheets.readRows(ctx.tenantId);
    return { ...data, rows: data.rows.slice(0, limit) };
  }

  async health(ctx: ProviderContext): Promise<IntegrationHealth> {
    const cfg = await this.sheets.getConfig(ctx.tenantId);
    if (!cfg) return this.fallback.health(ctx);
    return {
      source: 'sheets',
      status: cfg.status === 'connected' ? 'connected' : 'error',
      lastSyncAt: cfg.lastSyncAt,
      itemsLastSync: cfg.rowCount,
    };
  }
}
