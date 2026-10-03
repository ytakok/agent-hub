import type {
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
