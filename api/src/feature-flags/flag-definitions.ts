import type {
  FeatureFlagDefinition,
  FeatureFlags,
  FeatureKey,
  PlanTier,
  TenantFeatureOverrides,
  TenantSettings,
} from '@agency-hub/shared';

/**
 * Code-level defaults. Documents in Firestore `featureFlags/{key}` override these globally,
 * and `tenants/{tid}/config/features.overrides` override per customer.
 */
export const DEFAULT_FLAG_DEFINITIONS: readonly FeatureFlagDefinition[] = [
  { key: 'integration.crm', description: 'CRM pipeline & leads', defaultEnabled: true },
  { key: 'integration.sheets', description: 'Google Sheets sync', defaultEnabled: true },
  { key: 'integration.gmail', description: 'Customer emails from Gmail', defaultEnabled: true, plans: ['pro', 'enterprise'] },
  { key: 'integration.whatsapp', description: 'WhatsApp customer requests', defaultEnabled: true, plans: ['pro', 'enterprise'] },
  { key: 'dashboard.renewals', description: 'Policy renewals widget', defaultEnabled: true },
  { key: 'dashboard.activity', description: 'Unified activity feed', defaultEnabled: true },
  { key: 'module.customers', description: 'Customers module', defaultEnabled: true },
  { key: 'module.messages', description: 'Unified inbox module', defaultEnabled: true, plans: ['pro', 'enterprise'] },
  { key: 'auth.usernameLogin', description: 'Login with username', defaultEnabled: true },
  { key: 'auth.google', description: 'Sign in with Google', defaultEnabled: true },
];

export const FEATURE_KEYS: readonly FeatureKey[] = DEFAULT_FLAG_DEFINITIONS.map((d) => d.key);

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  renewalWindowDays: 30,
  messageSlaHours: 4,
  workingHours: { start: '08:30', end: '17:30', days: [0, 1, 2, 3, 4] },
  dashboardWidgets: ['kpis', 'crmPipeline', 'whatsapp', 'gmail', 'renewals', 'sheets', 'activity', 'health'],
};

/** Pure merge: definition default (gated by plan) ← per-tenant override. */
export function resolveFlags(
  definitions: readonly FeatureFlagDefinition[],
  plan: PlanTier,
  tenantOverrides: TenantFeatureOverrides['overrides'] = {},
): FeatureFlags {
  const flags = {} as FeatureFlags;
  for (const def of definitions) {
    const planAllows = !def.plans?.length || def.plans.includes(plan);
    flags[def.key] = tenantOverrides[def.key] ?? (def.defaultEnabled && planAllows);
  }
  return flags;
}

/** Overlay Firestore definitions on top of the code defaults, ignoring unknown keys. */
export function mergeDefinitions(stored: Partial<FeatureFlagDefinition>[]): FeatureFlagDefinition[] {
  const byKey = new Map(DEFAULT_FLAG_DEFINITIONS.map((d) => [d.key, { ...d }]));
  for (const s of stored) {
    if (!s.key) continue;
    const base = byKey.get(s.key);
    if (base) byKey.set(s.key, { ...base, ...s, key: base.key });
  }
  return [...byKey.values()];
}
