import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type {
  ConnectSheetRequest,
  SheetRecord,
  SheetsIntegrationDoc,
  SheetsIntegrationStatus,
  SheetsTestResult,
} from '@agency-hub/shared';
import { AppConfig } from '../../config/app-config.service.js';
import { TenantConfigService } from '../../feature-flags/tenant-config.service.js';
import { FIRESTORE } from '../../firebase/firebase.module.js';
import { GoogleSheetsClient, SheetsError, parseSpreadsheetId, type SheetTable } from './google-sheets.client.js';

export interface SheetRows {
  sheetName: string;
  columns: string[];
  /** Newest first. */
  rows: SheetRecord[];
  total: number;
}

interface Cached<T> {
  at: number;
  value: T;
}

const CONFIG_TTL_MS = 30_000;
/** Header names treated as the row's date (removed from the columns; shown as the row time instead). */
const DATE_HEADER = /^(date|time|timestamp|created( at)?|תאריך|זמן|נוצר)$/i;

/**
 * Per-tenant Google Sheets connection: config in `tenants/{tid}/integrations/sheets`, rows fetched through
 * the platform service account and cached for SHEETS_CACHE_SECONDS so dashboards don't hit Google's quota.
 */
@Injectable()
export class SheetsIntegrationService {
  private readonly logger = new Logger(SheetsIntegrationService.name);
  private readonly configCache = new Map<string, Cached<SheetsIntegrationDoc | null>>();
  private readonly rowCache = new Map<string, Cached<SheetRows>>();

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly client: GoogleSheetsClient,
    private readonly config: AppConfig,
    private readonly tenantConfig: TenantConfigService,
  ) {}

  /** Sheet times carry no zone; read them in the organization's timezone, not the server's. */
  private async timezone(tenantId: string): Promise<string> {
    const cfg = await this.tenantConfig.getRuntimeConfig(tenantId).catch(() => null);
    return cfg?.tenant.timezone || 'Asia/Jerusalem';
  }

  async getConfig(tenantId: string): Promise<SheetsIntegrationDoc | null> {
    const hit = this.configCache.get(tenantId);
    if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value;
    const snap = await this.doc(tenantId).get();
    const value = snap.exists ? (snap.data() as SheetsIntegrationDoc) : null;
    this.configCache.set(tenantId, { at: Date.now(), value });
    return value;
  }

  async status(tenantId: string): Promise<SheetsIntegrationStatus> {
    const cfg = await this.getConfig(tenantId);
    const base = { serviceAccountEmail: this.client.serviceAccountEmail };
    if (!cfg) return { ...base, mode: this.config.isMock ? 'mock' : 'not_connected' };
    return {
      ...base,
      mode: 'live',
      spreadsheetId: cfg.spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/edit`,
      spreadsheetTitle: cfg.spreadsheetTitle,
      sheetName: cfg.sheetName,
      rowCount: cfg.rowCount,
      lastSyncAt: cfg.lastSyncAt,
      lastError: cfg.lastError,
    };
  }

  /** Rows for the dashboard, from cache when fresh. Throws SheetsError when the sheet can't be read. */
  async readRows(tenantId: string): Promise<SheetRows> {
    const cfg = await this.getConfig(tenantId);
    if (!cfg) throw new SheetsError('not_found', 'No sheet connected');
    const ttl = this.config.get('SHEETS_CACHE_SECONDS') * 1000;
    const key = `${tenantId}:${cfg.spreadsheetId}:${cfg.sheetName ?? ''}`;
    const hit = this.rowCache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;

    try {
      const table = await this.client.readTable(cfg.spreadsheetId, cfg.sheetName, cfg.headerRow);
      const value = toSheetRows(table, new Date().toISOString(), await this.timezone(tenantId));
      this.rowCache.set(key, { at: Date.now(), value });
      this.record(tenantId, { status: 'connected', spreadsheetTitle: table.spreadsheetTitle, rowCount: value.total });
      return value;
    } catch (e) {
      const err = e instanceof SheetsError ? e : new SheetsError('unknown');
      this.logger.warn(`Sheets read failed for tenant ${tenantId}: ${err.code}`);
      this.record(tenantId, { status: 'error', lastError: err.code });
      throw err;
    }
  }

  /** Reads the sheet now (no cache) and reports what was found. Never throws for sheet problems. */
  async test(tenantId: string): Promise<SheetsTestResult> {
    const cfg = await this.getConfig(tenantId);
    if (!cfg) return { ok: false, error: 'not_found' };
    this.invalidate(tenantId);
    try {
      const rows = await this.readRows(tenantId);
      return { ok: true, spreadsheetTitle: cfg.spreadsheetTitle, sheetName: rows.sheetName, columns: rows.columns, rowCount: rows.total };
    } catch (e) {
      return { ok: false, error: e instanceof SheetsError ? e.code : 'unknown' };
    }
  }

  /** Platform admin: verify the sheet is readable, then save it as the tenant's source. */
  async connect(tenantId: string, req: ConnectSheetRequest, actorUid: string): Promise<SheetsTestResult> {
    const spreadsheetId = parseSpreadsheetId(req.spreadsheet);
    if (!spreadsheetId) throw new BadRequestException('Not a Google Sheets URL or spreadsheet ID');
    const headerRow = req.headerRow ?? 1;
    try {
      const table = await this.client.readTable(spreadsheetId, req.sheetName || undefined, headerRow);
      const rows = toSheetRows(table, new Date().toISOString(), await this.timezone(tenantId));
      const doc: SheetsIntegrationDoc = {
        status: 'connected',
        spreadsheetId,
        sheetName: req.sheetName || undefined,
        headerRow,
        spreadsheetTitle: table.spreadsheetTitle,
        rowCount: rows.total,
        lastSyncAt: new Date().toISOString(),
        connectedAt: new Date().toISOString(),
        connectedBy: actorUid,
      };
      await this.doc(tenantId).set(stripUndefined(doc));
      this.invalidate(tenantId);
      return { ok: true, spreadsheetTitle: table.spreadsheetTitle, sheetName: rows.sheetName, columns: rows.columns, rowCount: rows.total };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      return { ok: false, error: e instanceof SheetsError ? e.code : 'unknown' };
    }
  }

  async disconnect(tenantId: string): Promise<void> {
    await this.doc(tenantId).delete();
    this.invalidate(tenantId);
  }

  private invalidate(tenantId: string): void {
    this.configCache.delete(tenantId);
    for (const k of this.rowCache.keys()) if (k.startsWith(`${tenantId}:`)) this.rowCache.delete(k);
  }

  /** Fire-and-forget sync bookkeeping; a failed write never breaks the dashboard. */
  private record(tenantId: string, patch: Partial<SheetsIntegrationDoc>): void {
    const update: Record<string, unknown> = { ...stripUndefined(patch), lastSyncAt: new Date().toISOString() };
    if (patch.status === 'connected') update['lastError'] = FieldValue.delete();
    this.doc(tenantId)
      .update(update)
      .then(() => this.configCache.delete(tenantId))
      .catch((err: unknown) => this.logger.warn(`Could not record sheet sync: ${String(err)}`));
  }

  private doc(tenantId: string) {
    return this.db.doc(`tenants/${tenantId}/integrations/sheets`);
  }
}

/** Sheet table → dashboard rows: date column (if any) becomes the row time; newest first. */
export function toSheetRows(table: SheetTable, fetchedAt: string, timeZone = 'Asia/Jerusalem'): SheetRows {
  const dateIdx = table.headers.findIndex((h) => DATE_HEADER.test(h));
  const keep = table.headers.map((h, i) => ({ h, i })).filter(({ h, i }) => h && i !== dateIdx);
  const rows: SheetRecord[] = table.rows.map((r) => ({
    id: `row_${r.rowNumber}`,
    sheetName: table.sheetName,
    rowNumber: r.rowNumber,
    data: Object.fromEntries(keep.map(({ h, i }) => [h, r.cells[i] ?? ''])),
    syncedAt: (dateIdx >= 0 && parseSheetDate(r.cells[dateIdx], timeZone)) || fetchedAt,
  }));
  // With a date column sort by it; otherwise the last appended row is the newest.
  rows.sort((a, b) => (dateIdx >= 0 ? b.syncedAt.localeCompare(a.syncedAt) : 0) || b.rowNumber - a.rowNumber);
  return { sheetName: table.sheetName, columns: keep.map(({ h }) => h), rows, total: rows.length };
}

/**
 * "2026-09-22 11:23", "22/09/2026 11:23" or "22.09.2026" → ISO, reading the wall-clock time in `timeZone`
 * (e.g. Asia/Jerusalem) so the result is the same on any server. Null when the cell isn't a recognizable date.
 */
export function parseSheetDate(value: string | undefined, timeZone = 'Asia/Jerusalem'): string | null {
  if (!value) return null;
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v);
  if (m) return zonedIso(+m[1]!, +m[2]!, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), timeZone);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(v);
  if (m) return zonedIso(+m[3]!, +m[2]!, +m[1]!, +(m[4] ?? 0), +(m[5] ?? 0), timeZone);
  return null;
}

/** Wall-clock time in a timezone → UTC ISO string. DST-aware via Intl, no date library needed. */
function zonedIso(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  /** Offset (ms) of `timeZone` from UTC at instant t. */
  const offset = (t: number) => {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(t))) if (part.type !== 'literal') p[part.type] = Number(part.value);
    return Date.UTC(p['year']!, p['month']! - 1, p['day']!, p['hour']!, p['minute']!) - t;
  };
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const utc = wall - offset(wall - offset(wall)); // second pass settles DST boundaries
  return new Date(utc + offset(utc)).getUTCDate() === d ? new Date(utc).toISOString() : null;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
