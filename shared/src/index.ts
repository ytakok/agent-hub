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
  | 'auth.google'
  | 'search.customer360';

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

export type PolicyType = 'car' | 'home' | 'life' | 'health' | 'business' | 'travel' | 'disability' | 'personal_accident';

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

// ---------- Customer search & 360° profile ----------

/** What a search term was matched against. `auto` lets the server detect it. */
export type CustomerSearchField = 'nationalId' | 'phone' | 'policyNumber' | 'name';

export interface CustomerSearchRequest {
  q: string;
  by?: CustomerSearchField | 'auto';
}

export interface CustomerSearchHit {
  customerId: string;
  fullName: string;
  /** Always masked in search results, e.g. `*****6787`. */
  nationalIdMasked: string;
  phone?: string;
  city?: string;
  status: 'lead' | 'active' | 'churned';
  matchedOn: CustomerSearchField;
  /** The policy number that matched, when matchedOn = policyNumber. */
  matchedPolicyNumber?: string;
  /** Set when the ID belongs to a family member covered by/linked to this customer. */
  matchedFamilyMember?: string;
  activePolicies: number;
}

export interface CustomerSearchResponse {
  /** Fields the server searched, after detecting the term type. */
  searchedBy: CustomerSearchField[];
  hits: CustomerSearchHit[];
}

export type Gender = 'male' | 'female' | 'other';
export type FamilyRelation = 'spouse' | 'child' | 'parent' | 'sibling' | 'other';

export interface CustomerProfile {
  id: string;
  /** Masked for the `viewer` role. */
  nationalId: string;
  nationalIdMasked: boolean;
  fullName: string;
  birthDate?: IsoDate;
  gender?: Gender;
  phones: string[];
  emails: string[];
  address?: { street?: string; city?: string; zip?: string };
  status: 'lead' | 'active' | 'churned';
  tags: string[];
  assignedAgent?: string;
  preferredChannel?: 'phone' | 'whatsapp' | 'email';
  consent: { marketing: boolean; updatedAt?: IsoDate };
  customerSince?: IsoDate;
}

export type PolicyStatusDetail = 'active' | 'pending_renewal' | 'expired' | 'cancelled' | 'suspended';
export type PremiumFrequency = 'monthly' | 'quarterly' | 'yearly';
export type PaymentStatus = 'paid' | 'due' | 'overdue' | 'failed';

export interface PolicyDetail {
  id: string;
  policyNumber: string;
  type: PolicyType;
  carrier: string;
  productName: string;
  status: PolicyStatusDetail;
  startDate: IsoDate;
  endDate: IsoDate;
  renewalDate?: IsoDate;
  premium: { amount: number; currency: string; frequency: PremiumFrequency };
  coverageSummary?: string;
  /** Family member IDs (FamilyMember.id) insured under this policy — health/life policies. */
  insuredMemberIds: string[];
  payment: { method: 'credit_card' | 'bank_debit' | 'check' | 'other'; status: PaymentStatus; lastPaidAt?: IsoDate; nextDueAt?: IsoDate };
  vehicle?: { plate: string; model: string; year: number };
  property?: { address: string };
}

export type ClaimStatus = 'open' | 'awaiting_documents' | 'in_review' | 'approved' | 'paid' | 'rejected' | 'closed';

export interface Claim {
  id: string;
  claimNumber: string;
  policyId: string;
  policyNumber: string;
  type: PolicyType;
  status: ClaimStatus;
  /** Derived: open, awaiting_documents, in_review and approved count as open. */
  isOpen: boolean;
  openedAt: IsoDate;
  closedAt?: IsoDate;
  amountClaimed: number;
  amountPaid?: number;
  /** Documents the carrier is still waiting for (status awaiting_documents). */
  missingDocuments?: string[];
  currency: string;
  description: string;
  handler?: string;
}

export interface FamilyMember {
  id: string;
  relation: FamilyRelation;
  fullName: string;
  /** Masked for the `viewer` role. */
  nationalId?: string;
  birthDate?: IsoDate;
  /** When the family member is also a customer — the profile can link to them. */
  customerId?: string;
  /** Health/life policies that cover this member (policy numbers). */
  coveredByPolicyNumbers: string[];
}

export interface CustomerInteraction {
  id: string;
  channel: 'phone' | 'whatsapp' | 'email' | 'meeting' | 'sms';
  direction: 'in' | 'out';
  summary: string;
  at: IsoDate;
  by?: string;
}

export interface CustomerDocument {
  id: string;
  name: string;
  kind: 'policy' | 'id' | 'claim' | 'license' | 'medical' | 'other';
  uploadedAt: IsoDate;
}

export interface CustomerTask {
  id: string;
  title: string;
  dueAt?: IsoDate;
  status: 'open' | 'done';
  assignee?: string;
}

export type CustomerAlertKind =
  | 'payment_overdue'
  | 'renewal_due'
  | 'policy_expired'
  | 'claim_open_long'
  | 'family_uninsured_health'
  | 'consent_missing'
  | 'task_overdue'
  | 'coverage_gap_disability'
  | 'coverage_gap_child_accident';

/** Alert kinds shown as "coverage gaps" (cross-sell opportunities) rather than operational alerts. */
export type CoverageGapKind = Extract<CustomerAlertKind, 'family_uninsured_health' | 'coverage_gap_disability' | 'coverage_gap_child_accident'>;

export interface CustomerAlert {
  kind: CustomerAlertKind;
  severity: 'high' | 'medium' | 'low';
  /** Values for the i18n message, e.g. { policyNumber, days }. */
  params: Record<string, string | number>;
}

export interface Customer360 {
  customer: CustomerProfile;
  summary: {
    activePolicies: number;
    annualPremium: number;
    currency: string;
    openClaims: number;
    closedClaims: number;
    familyMembers: number;
  };
  alerts: CustomerAlert[];
  /** All policies, active first. The UI filters to active by default. */
  policies: PolicyDetail[];
  /** Open first, then closed — newest first within each group. */
  claims: Claim[];
  family: FamilyMember[];
  interactions: CustomerInteraction[];
  documents: CustomerDocument[];
  tasks: CustomerTask[];
  source: { system: string; fetchedAt: IsoDate };
}
