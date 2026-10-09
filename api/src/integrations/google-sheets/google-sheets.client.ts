import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { JWT } from 'google-auth-library';
import type { SheetsErrorCode } from '@agency-hub/shared';
import { AppConfig } from '../../config/app-config.service.js';

/** Read-only: the API can never modify an agency's sheet, even if compromised. */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
/** Columns A..Z are plenty for a leads sheet and keep responses small. */
const LAST_COLUMN = 'Z';

export class SheetsError extends Error {
  constructor(
    readonly code: SheetsErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface SheetTable {
  spreadsheetTitle: string;
  sheetName: string;
  headers: string[];
  /** Data rows below the header, as displayed in the sheet (strings), blank rows removed; rowNumber is the 1-based sheet row. */
  rows: { rowNumber: number; cells: string[] }[];
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/**
 * Thin Google Sheets REST client authenticated as the platform's Sheets service account.
 * Agencies share their sheet with `serviceAccountEmail` as Viewer; nothing else is accessible.
 */
@Injectable()
export class GoogleSheetsClient {
  private readonly logger = new Logger(GoogleSheetsClient.name);
  private readonly key: ServiceAccountKey | null;
  /** What was found in SHEETS_SERVICE_ACCOUNT_JSON / _FILE (shape and length only). */
  readonly credentialState: SheetsCredentialState;
  readonly credentialLength: number;
  private jwt: JWT | null = null;

  constructor(config: AppConfig) {
    const loaded = loadKey(config.get('SHEETS_SERVICE_ACCOUNT_JSON'), config.get('SHEETS_SERVICE_ACCOUNT_FILE'));
    this.key = loaded.key;
    this.credentialState = loaded.state;
    this.credentialLength = loaded.length;
    if (!this.key) this.logger.warn(`Google Sheets: service account not usable (${loaded.state}, ${loaded.length} chars). Expected the full key JSON file.`);
  }

  get serviceAccountEmail(): string | null {
    return this.key?.client_email ?? null;
  }

  /** Reads the header row and data rows of one tab (the first tab when `sheetName` is empty). */
  async readTable(spreadsheetId: string, sheetName?: string, headerRow = 1): Promise<SheetTable> {
    const meta = await this.get<{ properties: { title: string }; sheets: { properties: { title: string } }[] }>(
      `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`,
    );
    const tabs = meta.sheets.map((s) => s.properties.title);
    const tab = sheetName ? tabs.find((t) => t === sheetName) : tabs[0];
    if (!tab) throw new SheetsError('tab_not_found');

    const range = `'${tab.replace(/'/g, "''")}'!A${headerRow}:${LAST_COLUMN}`;
    const values = await this.get<{ values?: string[][] }>(
      `${API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`,
    );
    const [header = [], ...data] = values.values ?? [];
    const headers = header.map((h) => String(h ?? '').trim());
    if (!headers.some(Boolean)) throw new SheetsError('empty');

    const rows = data
      .map((r, i) => ({ rowNumber: headerRow + 1 + i, cells: headers.map((_, c) => String(r[c] ?? '').trim()) }))
      .filter((r) => r.cells.some(Boolean));
    return { spreadsheetTitle: meta.properties.title, sheetName: tab, headers, rows };
  }

  private async get<T>(url: string): Promise<T> {
    if (!this.key) throw new SheetsError('credentials_missing');
    this.jwt ??= new JWT({ email: this.key.client_email, key: this.key.private_key, scopes: [SCOPE] });
    try {
      return (await this.jwt.request<T>({ url, timeout: 15_000 })).data;
    } catch (e) {
      throw toSheetsError(e);
    }
  }
}

/** Maps Google API failures to stable codes; never leaks Google's raw message to clients. */
export function toSheetsError(e: unknown): SheetsError {
  if (e instanceof SheetsError) return e;
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  const status = err.response?.status;
  const message = err.response?.data?.error?.message ?? err.message ?? '';
  if (status === 403 && /has not been used|is disabled/i.test(message)) return new SheetsError('api_disabled', message);
  if (status === 403) return new SheetsError('not_shared', message);
  if (status === 404) return new SheetsError('not_found', message);
  if (status === 400 && /parse range|Unable to parse/i.test(message)) return new SheetsError('tab_not_found', message);
  if (status === 429) return new SheetsError('rate_limited', message);
  if (/invalid_grant|private key|PEM/i.test(message)) return new SheetsError('credentials_missing', message);
  return new SheetsError('unknown', message);
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(s)?.[1];
  const id = fromUrl ?? s;
  return /^[A-Za-z0-9_-]{20,100}$/.test(id) ? id : null;
}

/** Shape of the configured key, for /api/health. Never includes the key itself. */
export type SheetsCredentialState = 'json' | 'file' | 'none' | 'not_json' | 'missing_fields' | 'file_unreadable';

function loadKey(json?: string, file?: string): { key: ServiceAccountKey | null; state: SheetsCredentialState; length: number } {
  let raw = '';
  let source: 'json' | 'file' = 'json';
  if (json?.trim()) raw = json.trim();
  else if (file) {
    source = 'file';
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      return { key: null, state: 'file_unreadable', length: 0 };
    }
  }
  if (!raw) return { key: null, state: 'none', length: 0 };
  let k: Partial<ServiceAccountKey>;
  try {
    k = JSON.parse(raw) as Partial<ServiceAccountKey>;
  } catch {
    return { key: null, state: 'not_json', length: raw.length };
  }
  if (!k.client_email || !k.private_key) return { key: null, state: 'missing_fields', length: raw.length };
  return { key: { client_email: k.client_email, private_key: k.private_key }, state: source, length: raw.length };
}
