import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  FeatureFlagDefinition,
  FeatureKey,
  Tenant,
  TenantFeatureOverrides,
  TenantRuntimeConfig,
  TenantSettings,
} from '@agency-hub/shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { DEFAULT_TENANT_SETTINGS, FEATURE_KEYS, mergeDefinitions, resolveFlags } from './flag-definitions.js';

const TTL_MS = 30_000;

interface CacheEntry<T> {
  at: number;
  value: T;
}

/** Resolves everything that shapes the app per customer: branding, feature flags and settings. */
@Injectable()
export class TenantConfigService {
  private readonly cache = new Map<string, CacheEntry<TenantRuntimeConfig>>();
  private definitions?: CacheEntry<FeatureFlagDefinition[]>;

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getRuntimeConfig(tenantId: string): Promise<TenantRuntimeConfig> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const tenantRef = this.db.doc(`tenants/${tenantId}`);
    const [tenantSnap, featuresSnap, settingsSnap, definitions] = await Promise.all([
      tenantRef.get(),
      tenantRef.collection('config').doc('features').get(),
      tenantRef.collection('config').doc('settings').get(),
      this.getDefinitions(),
    ]);
    if (!tenantSnap.exists) throw new NotFoundException('Organization not found');

    const tenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;
    const overrides = (featuresSnap.data() as TenantFeatureOverrides | undefined)?.overrides ?? {};
    const settings: TenantSettings = { ...DEFAULT_TENANT_SETTINGS, ...(settingsSnap.data() as Partial<TenantSettings>) };

    const value: TenantRuntimeConfig = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        locales: tenant.locales,
        branding: tenant.branding,
        currency: tenant.currency,
        timezone: tenant.timezone,
      },
      features: resolveFlags(definitions, tenant.plan, overrides),
      settings,
    };
    this.cache.set(tenantId, { at: Date.now(), value });
    return value;
  }

  async isEnabled(tenantId: string, ...keys: FeatureKey[]): Promise<boolean> {
    const { features } = await this.getRuntimeConfig(tenantId);
    return keys.every((k) => features[k]);
  }

  /** Merges a patch into the tenant's overrides; `null` removes an override (back to the plan default). */
  async updateOverrides(tenantId: string, patch: Record<string, unknown>, actorUid: string): Promise<TenantRuntimeConfig> {
    const tenantRef = this.db.doc(`tenants/${tenantId}`);
    if (!(await tenantRef.get()).exists) throw new NotFoundException('Organization not found');

    const ref = tenantRef.collection('config').doc('features');
    await this.db.runTransaction(async (tx) => {
      const current = ((await tx.get(ref)).data() as TenantFeatureOverrides | undefined)?.overrides ?? {};
      const next: Partial<Record<FeatureKey, boolean>> = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (!FEATURE_KEYS.includes(key as FeatureKey)) throw new BadRequestException(`Unknown feature "${key}"`);
        if (typeof value !== 'boolean' && value !== null) throw new BadRequestException(`Feature "${key}" must be boolean or null`);
        if (value === null) delete next[key as FeatureKey];
        else next[key as FeatureKey] = value;
      }
      tx.set(ref, { overrides: next, updatedAt: new Date().toISOString(), updatedBy: actorUid } satisfies TenantFeatureOverrides);
    });
    this.cache.delete(tenantId);
    return this.getRuntimeConfig(tenantId);
  }

  async updateSettings(tenantId: string, patch: Partial<TenantSettings>): Promise<TenantRuntimeConfig> {
    await this.db.doc(`tenants/${tenantId}/config/settings`).set(patch, { merge: true });
    this.cache.delete(tenantId);
    return this.getRuntimeConfig(tenantId);
  }

  private async getDefinitions(): Promise<FeatureFlagDefinition[]> {
    if (this.definitions && Date.now() - this.definitions.at < TTL_MS) return this.definitions.value;
    const snap = await this.db.collection('featureFlags').get();
    const value = mergeDefinitions(snap.docs.map((d) => ({ key: d.id as FeatureKey, ...d.data() })));
    this.definitions = { at: Date.now(), value };
    return value;
  }
}
