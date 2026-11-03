import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseConnectionSheet } from './connection-sheet.js';
import { buildCredentialPlan, maskValue, type PlannedCredential } from './credential-plan.js';
import { N8nApiError, type N8nApiClient, type N8nCredentialSchema } from './n8n-api.client.js';

/** The configured n8n client, or null when N8N_BASE_URL / N8N_API_KEY are not set. */
export const N8N_API = Symbol('N8N_API');

export interface PreviewCredential {
  appId: string;
  name: string;
  type: string;
  needsSignIn: boolean;
  /** Field → masked value, so the operator can check the right values were pasted. */
  fields: Record<string, string>;
  /** Required by n8n's schema but not on the sheet. Empty when the schema could not be read. */
  missingRequired: string[];
}

export interface CredentialPreview {
  n8nConfigured: boolean;
  redirectUri?: string;
  credentials: PreviewCredential[];
  problems: string[];
  notes: string[];
}

export interface CredentialImport {
  created: Array<{ name: string; type: string; id: string; url: string; needsSignIn: boolean }>;
  failed: Array<{ name: string; type: string; error: string }>;
  problems: string[];
  notes: string[];
}

/**
 * Turns a customer's connection sheet into n8n credentials.
 * Secret values only pass through: they are never stored, logged or returned.
 */
@Injectable()
export class N8nCredentialsService {
  constructor(@Inject(N8N_API) private readonly n8n: N8nApiClient | null) {}

  async preview(sheetText: string, customerName: string): Promise<CredentialPreview> {
    const sheet = parseConnectionSheet(sheetText);
    const plan = buildCredentialPlan(sheet, checkCustomer(customerName));
    const schemas = await this.schemas(plan.credentials, plan.problems);

    return {
      n8nConfigured: Boolean(this.n8n),
      redirectUri: sheet.redirectUri,
      credentials: plan.credentials.map((c) => ({
        appId: c.appId,
        name: c.name,
        type: c.type,
        needsSignIn: c.needsSignIn,
        fields: Object.fromEntries(Object.entries(c.data).map(([key, value]) => [key, maskValue(value)])),
        missingRequired: (schemas.get(c.type)?.required ?? []).filter((key) => !(key in c.data)),
      })),
      problems: plan.problems,
      notes: plan.notes,
    };
  }

  async import(sheetText: string, customerName: string): Promise<CredentialImport> {
    const n8n = this.requireClient();
    const plan = buildCredentialPlan(parseConnectionSheet(sheetText), checkCustomer(customerName));
    if (!plan.credentials.length)
      throw new BadRequestException(plan.problems.join(' ') || 'Nothing to import.');

    const result: CredentialImport = { created: [], failed: [], problems: plan.problems, notes: plan.notes };
    // One at a time: a wrong API key fails fast instead of producing a wall of identical errors.
    for (const credential of plan.credentials) {
      try {
        const created = await n8n.createCredential({
          name: credential.name,
          type: credential.type,
          data: credential.data,
        });
        result.created.push({
          name: created.name,
          type: created.type,
          id: created.id,
          url: n8n.credentialUrl(created.id),
          needsSignIn: credential.needsSignIn,
        });
      } catch (e) {
        if (e instanceof N8nApiError && (e.status === 0 || e.status === 401))
          throw new ServiceUnavailableException(e.message);
        result.failed.push({ name: credential.name, type: credential.type, error: describe(e) });
      }
    }
    return result;
  }

  private requireClient(): N8nApiClient {
    if (!this.n8n)
      throw new ServiceUnavailableException('n8n is not configured. Set N8N_BASE_URL and N8N_API_KEY.');
    return this.n8n;
  }

  private async schemas(
    credentials: PlannedCredential[],
    problems: string[],
  ): Promise<Map<string, N8nCredentialSchema>> {
    const schemas = new Map<string, N8nCredentialSchema>();
    if (!this.n8n) return schemas;
    for (const type of new Set(credentials.map((c) => c.type))) {
      try {
        schemas.set(type, await this.n8n.getSchema(type));
      } catch (e) {
        problems.push(`Could not read the n8n schema for ${type}: ${describe(e)}`);
      }
    }
    return schemas;
  }
}

function checkCustomer(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60 || [...trimmed].some((ch) => ch.charCodeAt(0) < 32)) {
    throw new BadRequestException('Customer name must be 1–60 characters.');
  }
  return trimmed;
}

function describe(e: unknown): string {
  return e instanceof N8nApiError ? e.message : 'Unexpected error.';
}
