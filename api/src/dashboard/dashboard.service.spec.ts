import type { FeatureFlags, TenantRuntimeConfig } from '@agency-hub/shared';
import { DEFAULT_FLAG_DEFINITIONS, DEFAULT_TENANT_SETTINGS, resolveFlags } from '../feature-flags/flag-definitions.js';
import type { TenantConfigService } from '../feature-flags/tenant-config.service.js';
import { MockDatasetService } from '../integrations/mock/mock-dataset.service.js';
import { MockCrmProvider, MockGmailProvider, MockSheetsProvider, MockWhatsAppProvider } from '../integrations/mock/mock-providers.js';
import { DashboardService, percentChange } from './dashboard.service.js';

function setup(features: Partial<FeatureFlags> = {}) {
  const config: TenantRuntimeConfig = {
    tenant: {
      id: 't1',
      name: 'T',
      slug: 't',
      plan: 'pro',
      currency: 'ILS',
      timezone: 'Asia/Jerusalem',
      locales: { default: 'he', supported: ['he', 'en'] },
      branding: {} as never,
    },
    features: { ...resolveFlags(DEFAULT_FLAG_DEFINITIONS, 'pro'), ...features },
    settings: DEFAULT_TENANT_SETTINGS,
  };
  const tenantConfig = { getRuntimeConfig: vi.fn().mockResolvedValue(config) } as unknown as TenantConfigService;
  const data = new MockDatasetService();
  const providers = {
    crm: new MockCrmProvider(data),
    sheets: new MockSheetsProvider(data),
    gmail: new MockGmailProvider(data),
    whatsapp: new MockWhatsAppProvider(data),
  };
  const service = new DashboardService(tenantConfig, providers.crm, providers.sheets, providers.gmail, providers.whatsapp);
  return { service, providers };
}

describe('DashboardService', () => {
  it('returns every block from mock providers', async () => {
    const { service } = setup();
    const s = await service.getSummary('t1', '30d', 'en');
    expect(s.crm.status).toBe('ok');
    expect(s.sheets.status).toBe('ok');
    expect(s.gmail.status).toBe('ok');
    expect(s.whatsapp.status).toBe('ok');
    expect(s.kpis.map((k) => k.key)).toEqual(
      expect.arrayContaining(['newLeads', 'openMessages', 'renewalsDue', 'pipelineValue', 'sheetRows']),
    );
    expect(s.health.every((h) => h.status === 'mock')).toBe(true);
  });

  it('marks disabled features as disabled without calling the provider', async () => {
    const { service, providers } = setup({ 'integration.whatsapp': false });
    const spy = vi.spyOn(providers.whatsapp, 'listRequests');
    const s = await service.getSummary('t1', '30d', 'en');
    expect(s.whatsapp).toEqual({ status: 'disabled' });
    expect(spy).not.toHaveBeenCalled();
    expect(s.health.find((h) => h.source === 'whatsapp')?.status).toBe('disabled');
  });

  it('isolates a failing source to its own block', async () => {
    const { service, providers } = setup();
    vi.spyOn(providers.gmail, 'listCustomerMessages').mockRejectedValue(new Error('Gmail down'));
    const s = await service.getSummary('t1', '30d', 'en');
    expect(s.gmail).toEqual({ status: 'error', error: 'Gmail down' });
    expect(s.crm.status).toBe('ok');
    expect(s.whatsapp.status).toBe('ok');
  });

  it('produces deterministic mock data per tenant', async () => {
    const a = await setup().service.getSummary('t1', '30d', 'he');
    const b = await setup().service.getSummary('t1', '30d', 'he');
    expect(a.crm.status === 'ok' && a.crm.data).toEqual(b.crm.status === 'ok' && b.crm.data);
  });
});

describe('percentChange', () => {
  it('handles zero baselines', () => {
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(5, 0)).toBeUndefined();
    expect(percentChange(15, 10)).toBe(50);
  });
});
