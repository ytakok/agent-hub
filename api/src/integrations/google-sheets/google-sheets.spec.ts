import { parseSpreadsheetId, toSheetsError } from './google-sheets.client.js';
import { parseSheetDate, toSheetRows } from './sheets-integration.service.js';

const ID = '14vZ9mvSilBcQLq5kd0_chg0G1IaS-8Wjs7dfyFtjZs8';

describe('parseSpreadsheetId', () => {
  it('accepts a full URL or a bare ID', () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing#gid=0`)).toBe(ID);
    expect(parseSpreadsheetId(`  ${ID}  `)).toBe(ID);
  });

  it('rejects anything else', () => {
    expect(parseSpreadsheetId('https://example.com/not-a-sheet')).toBeNull();
    expect(parseSpreadsheetId('../../etc')).toBeNull();
  });
});

describe('toSheetsError', () => {
  const g = (status: number, message: string) => ({ response: { status, data: { error: { message } } } });

  it('maps Google failures to stable codes', () => {
    expect(toSheetsError(g(403, 'Google Sheets API has not been used in project 1 before or it is disabled')).code).toBe('api_disabled');
    expect(toSheetsError(g(403, 'The caller does not have permission')).code).toBe('not_shared');
    expect(toSheetsError(g(404, 'Requested entity was not found.')).code).toBe('not_found');
    expect(toSheetsError(g(400, 'Unable to parse range: Leads!A1:Z')).code).toBe('tab_not_found');
    expect(toSheetsError(g(429, 'Quota exceeded')).code).toBe('rate_limited');
  });
});

describe('parseSheetDate', () => {
  it('reads wall-clock times in the organization timezone, across DST', () => {
    expect(parseSheetDate('2026-09-22 11:23', 'Asia/Jerusalem')).toBe('2026-09-22T08:23:00.000Z'); // IDT, UTC+3
    expect(parseSheetDate('01/12/2026 10:00', 'Asia/Jerusalem')).toBe('2026-12-01T08:00:00.000Z'); // IST, UTC+2
    expect(parseSheetDate('2026-09-22', 'UTC')).toBe('2026-09-22T00:00:00.000Z');
  });

  it('returns null for non-dates', () => {
    expect(parseSheetDate('דחוף')).toBeNull();
    expect(parseSheetDate('2026-13-40')).toBeNull();
  });
});

describe('toSheetRows', () => {
  const table = {
    spreadsheetTitle: 'Leads',
    sheetName: 'Sheet1',
    headers: ['שם', 'טלפון', 'תאריך'],
    rows: [
      { rowNumber: 2, cells: ['Old', '050-1', '2026-09-01 09:00'] },
      { rowNumber: 4, cells: ['New', '050-2', '2026-10-01 09:00'] },
    ],
  };

  it('uses the date column as the row time, drops it from the columns, newest first', () => {
    const r = toSheetRows(table, '2026-10-06T00:00:00.000Z', 'UTC');
    expect(r.columns).toEqual(['שם', 'טלפון']);
    expect(r.rows.map((x) => x.data['שם'])).toEqual(['New', 'Old']);
    expect(r.rows[0]).toMatchObject({ id: 'row_4', rowNumber: 4, syncedAt: '2026-10-01T09:00:00.000Z' });
    expect(r.total).toBe(2);
  });

  it('without a date column, the last sheet row is the newest and fetch time is used', () => {
    const r = toSheetRows({ ...table, headers: ['שם', 'טלפון', 'הערות'] }, '2026-10-06T00:00:00.000Z');
    expect(r.rows.map((x) => x.rowNumber)).toEqual([4, 2]);
    expect(r.rows[0]?.syncedAt).toBe('2026-10-06T00:00:00.000Z');
  });
});
