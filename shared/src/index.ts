// Contracts shared by web and api. Types only — always import with `import type`.

export type Locale = 'he' | 'en';
export type Direction = 'rtl' | 'ltr';
export type Role = 'owner' | 'admin' | 'agent' | 'viewer';
export type DataSource = 'crm' | 'sheets' | 'gmail' | 'whatsapp';
export type DashboardRange = '7d' | '30d' | '90d';
export type IsoDate = string;

// ---------- Identity & tenancy ----------

export interface AuthClaims {
  tenantId: string;
  role: Role;
}

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string;
  phone?: string;
  tenantId: string;
  role: Role;
  status: 'active' | 'invited' | 'disabled';
  authProviders: string[];
  preferences: { language: Locale; dashboardLayout?: string[] };
  createdAt: IsoDate;
  updatedAt: IsoDate;
  lastLoginAt?: IsoDate;
}

export interface TenantBranding {
  logoUrl: string;
  faviconUrl?: string;
  colors: { primary: string; secondary: string; accent: string; bg: string; surface: string; text: string };
  font: string;
  radius: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  status: 'active' | 'trial' | 'suspended';
  timezone: string;
  currency: string;
  locales: { default: Locale; supported: Locale[] };
  branding: TenantBranding;
  createdAt: IsoDate;
}

// ---------- Feature flags & tenant settings ----------

export type PlanTier = 'starter' | 'pro' | 'enterprise';

/** Known flag keys. Add new keys here first so both apps stay type-safe. */
export type FeatureKey =
  | 'integration.crm'
  | 'integration.sheets'
  | 'integration.gmail'
  | 'integration.whatsapp'
  | 'dashboard.renewals'
  | 'dashboard.activity'
  | 'module.customers'
  | 'module.messages'
  | 'auth.usernameLogin'
  | 'auth.google';

/** Global default for a flag: `featureFlags/{key}`. */
export interface FeatureFlagDefinition {
  key: FeatureKey;
  description: string;
  defaultEnabled: boolean;
  /** Plans that get the flag by default. Empty/missing = every plan. */
  plans?: PlanTier[];
}

/** Per-tenant overrides: `tenants/{tid}/config/features` → `{ overrides: { [key]: boolean } }`. */
export interface TenantFeatureOverrides {
  overrides: Partial<Record<FeatureKey, boolean>>;
  updatedAt?: IsoDate;
  updatedBy?: string;
}

/** Per-tenant settings: `tenants/{tid}/config/settings`. */
export interface TenantSettings {
  renewalWindowDays: number;
  messageSlaHours: number;
  workingHours: { start: string; end: string; days: number[] };
  defaultAssigneeUid?: string;
  dashboardWidgets: DashboardWidgetKey[];
}

export type FeatureFlags = Record<FeatureKey, boolean>;

/** What `GET /tenants/current/config` returns — everything the UI needs to shape itself per customer. */
export interface TenantRuntimeConfig {
  tenant: Pick<Tenant, 'id' | 'name' | 'slug' | 'plan' | 'locales' | 'branding' | 'currency' | 'timezone'>;
  features: FeatureFlags;
  settings: TenantSettings;
}

// ---------- Domain ----------

export interface Customer {
  id: string;
  fullName: string;
  emails: string[];
  phones: string[];
  whatsappId?: string;
  city?: string;
  tags: string[];
  assignedTo?: string;
  status: 'lead' | 'active' | 'churned';
  source: DataSource | 'manual';
  lastContactAt?: IsoDate;
  createdAt: IsoDate;
}

export type PolicyType = 'car' | 'home' | 'life' | 'health' | 'business' | 'travel';

export interface Policy {
  id: string;
  customerId: string;
  customerName: string;
  type: PolicyType;
  carrier: string;
  policyNumber: string;
  premium: number;
  currency: string;
  startDate: IsoDate;
  endDate: IsoDate;
  renewalDate: IsoDate;
  status: 'active' | 'pending_renewal' | 'expired' | 'cancelled';
}

export type LeadStage = 'new' | 'contacted' | 'quoted' | 'negotiation' | 'won' | 'lost';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  productInterest: PolicyType;
  stage: LeadStage;
  value: number;
  assignedTo?: string;
  createdAt: IsoDate;
}

export type MessageChannel = 'gmail' | 'whatsapp';
export type MessageStatus = 'new' | 'assigned' | 'replied' | 'closed';

export interface Message {
  id: string;
  channel: MessageChannel;
  direction: 'in' | 'out';
  customerId?: string;
  fromName: string;
  from: string;
  subject?: string;
  snippet: string;
  status: MessageStatus;
  assignedTo?: string;
  receivedAt: IsoDate;
  slaDueAt?: IsoDate;
}

export interface SheetRecord {
  id: string;
  sheetName: string;
  rowNumber: number;
  data: Record<string, string | number>;
  syncedAt: IsoDate;
}

// ---------- Dashboard ----------

export type DashboardWidgetKey =
  | 'kpis'
  | 'crmPipeline'
  | 'sheets'
  | 'gmail'
  | 'whatsapp'
  | 'renewals'
  | 'activity'
  | 'health';

export interface Kpi {
  key: 'newLeads' | 'openMessages' | 'renewalsDue' | 'pipelineValue' | 'sheetRows';
  value: number;
  /** Change vs previous period, percent. */
  delta?: number;
  format: 'number' | 'currency';
}

export type SourceBlock<T> =
  | { status: 'ok'; data: T; lastSyncAt: IsoDate }
  | { status: 'error'; error: string }
  | { status: 'disabled' };

export interface ActivityItem {
  id: string;
  source: DataSource;
  type: 'lead_created' | 'message_received' | 'policy_renewed' | 'row_added' | 'stage_changed';
  title: string;
  at: IsoDate;
}

export interface IntegrationHealth {
  source: DataSource;
  status: 'connected' | 'error' | 'disabled' | 'mock';
  lastSyncAt?: IsoDate;
  itemsLastSync?: number;
}

export interface DashboardSummary {
  range: DashboardRange;
  generatedAt: IsoDate;
  currency: string;
  kpis: Kpi[];
  crm: SourceBlock<{ pipeline: { stage: LeadStage; count: number; value: number }[]; recentLeads: Lead[] }>;
  sheets: SourceBlock<{ sheetName: string; columns: string[]; rows: SheetRecord[] }>;
  gmail: SourceBlock<{ unread: number; messages: Message[] }>;
  whatsapp: SourceBlock<{ pending: number; overdue: number; messages: Message[] }>;
  renewals: SourceBlock<{ windowDays: number; policies: Policy[] }>;
  activity: ActivityItem[];
  health: IntegrationHealth[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ---------- API payloads ----------

export interface UsernameLoginRequest {
  username: string;
  password: string;
}

export interface UsernameLoginResponse {
  customToken: string;
}

export interface BootstrapUserRequest {
  username: string;
  displayName: string;
  language: Locale;
  /** Invitation code to join an existing tenant; without it a new tenant is created and the user is its owner. */
  inviteCode?: string;
  companyName?: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  path?: string;
  timestamp: IsoDate;
}
