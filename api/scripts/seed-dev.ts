/**
 * Seeds the local Firebase emulators with demo tenants, users, feature flags and settings.
 * Refuses to run unless both emulator hosts are set, so it can never touch a real project.
 *
 *   npm run seed            (from the repo root, emulators must be running)
 *
 * DEV-ONLY credentials (emulator only):
 *   owner@demo-insurance.test  / username: dana   / Passw0rd!demo
 *   agent@demo-insurance.test  / username: yossi  / Passw0rd!demo
 *   owner@acme-agency.test     / username: acme   / Passw0rd!demo   (starter plan, fewer features)
 *   admin@platform.test        / username: admin  / Passw0rd!demo   (platformAdmin — can change feature flags)
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { FeatureFlagDefinition, Role, Tenant, TenantFeatureOverrides, TenantSettings, UserProfile } from '@agency-hub/shared';
import { DEFAULT_FLAG_DEFINITIONS, DEFAULT_TENANT_SETTINGS } from '../src/feature-flags/flag-definitions.js';

process.env['FIREBASE_AUTH_EMULATOR_HOST'] ??= '127.0.0.1:9099';
process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
if (!process.env['FIREBASE_AUTH_EMULATOR_HOST'] || !process.env['FIRESTORE_EMULATOR_HOST']) {
  throw new Error('Seed only runs against the emulators.');
}

const PASSWORD = 'Passw0rd!demo';
const projectId = process.env['FIREBASE_PROJECT_ID'] ?? 'sample-app-5fff2';
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const now = new Date().toISOString();

const tenants: (Tenant & { overrides: TenantFeatureOverrides['overrides']; settings: Partial<TenantSettings> })[] = [
  {
    id: 'demo-insurance',
    name: 'דמו סוכנות לביטוח',
    slug: 'demo-insurance',
    plan: 'pro',
    status: 'active',
    timezone: 'Asia/Jerusalem',
    currency: 'ILS',
    locales: { default: 'he', supported: ['he', 'en'] },
    branding: {
      logoUrl: '/tenants/demo-insurance/logo.svg',
      colors: { primary: '#1f5eff', secondary: '#0f2a5c', accent: '#14b8a6', bg: '#f5f7fb', surface: '#ffffff', text: '#0f172a' },
      font: "'Rubik', system-ui, sans-serif",
      radius: '12px',
    },
    createdAt: now,
    overrides: {},
    settings: {},
  },
  {
    id: 'acme-agency',
    name: 'Acme Agency',
    slug: 'acme-agency',
    plan: 'starter',
    status: 'trial',
    timezone: 'Asia/Jerusalem',
    currency: 'ILS',
    locales: { default: 'en', supported: ['en', 'he'] },
    branding: {
      logoUrl: '/tenants/acme-agency/logo.svg',
      colors: { primary: '#c2410c', secondary: '#431407', accent: '#ca8a04', bg: '#fffaf5', surface: '#ffffff', text: '#1c1917' },
      font: "'Assistant', system-ui, sans-serif",
      radius: '6px',
    },
    createdAt: now,
    // Starter plan has no Gmail/WhatsApp; turn the activity feed off too, to show a per-tenant override.
    overrides: { 'dashboard.activity': false },
    settings: { renewalWindowDays: 60, dashboardWidgets: ['kpis', 'renewals', 'crmPipeline', 'sheets', 'health'] },
  },
];

const users: { email: string; username: string; displayName: string; tenantId: string; role: Role; platformAdmin?: boolean }[] = [
  { email: 'owner@demo-insurance.test', username: 'dana', displayName: 'דנה כהן', tenantId: 'demo-insurance', role: 'owner' },
  { email: 'agent@demo-insurance.test', username: 'yossi', displayName: 'יוסי לוי', tenantId: 'demo-insurance', role: 'agent' },
  { email: 'owner@acme-agency.test', username: 'acme', displayName: 'Alex Morgan', tenantId: 'acme-agency', role: 'owner' },
  { email: 'admin@platform.test', username: 'admin', displayName: 'Platform Admin', tenantId: 'demo-insurance', role: 'admin', platformAdmin: true },
];

async function main() {
  const batch = db.batch();
  for (const def of DEFAULT_FLAG_DEFINITIONS) {
    batch.set(db.doc(`featureFlags/${def.key}`), def satisfies FeatureFlagDefinition);
  }
  for (const { overrides, settings, ...tenant } of tenants) {
    const { id, ...data } = tenant;
    batch.set(db.doc(`tenants/${id}`), data);
    batch.set(db.doc(`tenants/${id}/config/features`), { overrides, updatedAt: now, updatedBy: 'seed' });
    batch.set(db.doc(`tenants/${id}/config/settings`), { ...DEFAULT_TENANT_SETTINGS, ...settings });
  }
  await batch.commit();

  for (const u of users) {
    const existing = await auth.getUserByEmail(u.email).catch(() => undefined);
    const record = existing
      ? await auth.updateUser(existing.uid, { password: PASSWORD, displayName: u.displayName, emailVerified: true })
      : await auth.createUser({ email: u.email, password: PASSWORD, displayName: u.displayName, emailVerified: true });
    await auth.setCustomUserClaims(record.uid, { tenantId: u.tenantId, role: u.role, ...(u.platformAdmin ? { platformAdmin: true } : {}) });

    const profile: UserProfile = {
      uid: record.uid,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      tenantId: u.tenantId,
      role: u.role,
      status: 'active',
      authProviders: ['password'],
      preferences: { language: u.tenantId === 'acme-agency' ? 'en' : 'he' },
      createdAt: now,
      updatedAt: now,
    };
    await db.doc(`users/${record.uid}`).set(profile);
    await db.doc(`usernames/${u.username}`).set({ uid: record.uid });
    await db.doc(`tenants/${u.tenantId}/members/${record.uid}`).set({ role: u.role, joinedAt: now });
  }

  console.log(`Seeded ${tenants.length} tenants, ${users.length} users, ${DEFAULT_FLAG_DEFINITIONS.length} feature flags into "${projectId}".`);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
