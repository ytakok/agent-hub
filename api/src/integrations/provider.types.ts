import type {
  Claim,
  CustomerDocument,
  CustomerInteraction,
  CustomerProfile,
  CustomerSearchField,
  CustomerTask,
  FamilyMember,
  PolicyDetail,
  Customer,
  DataSource,
  IntegrationHealth,
  Lead,
  LeadStage,
  Locale,
  Message,
  Paginated,
  Policy,
  SheetRecord,
} from '@agency-hub/shared';

/** Everything a provider needs to know about the caller. Credentials are looked up by tenantId, never passed in. */
export interface ProviderContext {
  tenantId: string;
  locale: Locale;
}

export interface IntegrationProvider {
  readonly source: DataSource;
  health(ctx: ProviderContext): Promise<IntegrationHealth>;
}

export interface PageQuery {
  page: number;
  pageSize: number;
  search?: string;
}

export interface CrmProvider extends IntegrationProvider {
  getPipeline(ctx: ProviderContext, since: Date): Promise<{ stage: LeadStage; count: number; value: number }[]>;
  getRecentLeads(ctx: ProviderContext, limit: number): Promise<Lead[]>;
  countNewLeads(ctx: ProviderContext, from: Date, to: Date): Promise<number>;
  listCustomers(ctx: ProviderContext, query: PageQuery): Promise<Paginated<Customer>>;
  /** Agency-management systems usually hold policies alongside the CRM. */
  getUpcomingRenewals(ctx: ProviderContext, windowDays: number): Promise<Policy[]>;
}

export interface SheetsProvider extends IntegrationProvider {
  getLatestRows(ctx: ProviderContext, limit: number): Promise<{ sheetName: string; columns: string[]; rows: SheetRecord[]; total: number }>;
}

export interface GmailProvider extends IntegrationProvider {
  /** Emails from known customers only, newest first. */
  listCustomerMessages(ctx: ProviderContext, limit: number): Promise<Message[]>;
}

export interface WhatsAppProvider extends IntegrationProvider {
  listRequests(ctx: ProviderContext, limit: number): Promise<Message[]>;
}

export const CRM_PROVIDER = Symbol('CRM_PROVIDER');
export const SHEETS_PROVIDER = Symbol('SHEETS_PROVIDER');
export const GMAIL_PROVIDER = Symbol('GMAIL_PROVIDER');
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

// ---------- Customer records (CRM / agency-management system) ----------

/** Normalized search criteria; any field set is OR-ed. Values are already normalized (see customer-search.util). */
export interface CustomerCriteria {
  nationalId?: string;
  phone?: string;
  policyNumber?: string;
  name?: string;
}

export type CustomerRecord = Omit<CustomerProfile, 'nationalIdMasked'> & {
  family: Omit<FamilyMember, 'coveredByPolicyNumbers'>[];
};

export interface CustomerMatch {
  customer: CustomerRecord;
  matchedOn: CustomerSearchField;
  matchedPolicyNumber?: string;
  /** Set when the ID matched a family member rather than the policyholder. */
  matchedFamilyMember?: string;
  activePolicies: number;
}

export interface CustomerBundle {
  customer: CustomerRecord;
  policies: PolicyDetail[];
  claims: Omit<Claim, 'isOpen' | 'policyNumber' | 'type'>[];
  interactions: CustomerInteraction[];
  documents: CustomerDocument[];
  tasks: CustomerTask[];
}

/**
 * Source of truth for customers, policies and claims — the agency's CRM / management system.
 * Live implementations call that system's API (or read records n8n synced into Firestore).
 */
export interface CustomerRecordsProvider {
  readonly system: string;
  findCustomers(ctx: ProviderContext, criteria: CustomerCriteria, limit: number): Promise<CustomerMatch[]>;
  getCustomerBundle(ctx: ProviderContext, customerId: string): Promise<CustomerBundle | null>;
}

export const CUSTOMER_RECORDS_PROVIDER = Symbol('CUSTOMER_RECORDS_PROVIDER');
