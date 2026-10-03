import { Injectable, NotImplementedException } from '@nestjs/common';
import type { DataSource, IntegrationHealth } from '@agency-hub/shared';
import type { CrmProvider, GmailProvider, ProviderContext, SheetsProvider, WhatsAppProvider } from '../provider.types.js';

/*
 * Live providers — implement one at a time and switch DATA_MODE=live.
 * Credentials: read `tenants/{tid}/integrations/{source}.secretRef` and load the secret from
 * GCP Secret Manager. Never store tokens in Firestore or send them to the browser.
 *
 * Alternative that avoids most of this code: let n8n own the connectors and push normalized
 * records to POST /api/ingest/:source (next phase); then these providers read from Firestore.
 */

abstract class NotConnected {
  abstract readonly source: DataSource;

  async health(_ctx: ProviderContext): Promise<IntegrationHealth> {
    return { source: this.source, status: 'error' };
  }

  protected todo(): never {
    throw new NotImplementedException(`${this.source} live provider is not implemented yet`);
  }
}

/** TODO: HubSpot / Salesforce / Monday / local agency system (e.g. via REST or n8n). */
@Injectable()
export class LiveCrmProvider extends NotConnected implements CrmProvider {
  readonly source = 'crm' as const;
  getPipeline(): never { return this.todo(); }
  getRecentLeads(): never { return this.todo(); }
  countNewLeads(): never { return this.todo(); }
  listCustomers(): never { return this.todo(); }
  getUpcomingRenewals(): never { return this.todo(); }
}

/** TODO: googleapis `sheets.spreadsheets.values.get` with a service account shared on the sheet. */
@Injectable()
export class LiveSheetsProvider extends NotConnected implements SheetsProvider {
  readonly source = 'sheets' as const;
  getLatestRows(): never { return this.todo(); }
}

/**
 * TODO: Gmail API `users.messages.list` with the tenant's offline refresh token (gmail.readonly — a restricted
 * scope that needs Google app verification for production). Prefer Pub/Sub push (`users.watch`) over polling.
 */
@Injectable()
export class LiveGmailProvider extends NotConnected implements GmailProvider {
  readonly source = 'gmail' as const;
  listCustomerMessages(): never { return this.todo(); }
}

/** TODO: Meta WhatsApp Cloud API — messages arrive by webhook (verify X-Hub-Signature-256) and are stored in Firestore. */
@Injectable()
export class LiveWhatsAppProvider extends NotConnected implements WhatsAppProvider {
  readonly source = 'whatsapp' as const;
  listRequests(): never { return this.todo(); }
}
