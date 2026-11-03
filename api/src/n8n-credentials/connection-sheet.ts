/**
 * Parser for the "connection sheet" customers copy from the SMB Automation /connect page.
 *
 *   Connection sheet for SMB Automation
 *   n8n redirect URI: https://n8n.example/rest/oauth2-credential/callback
 *
 *   [google]
 *   n8n credential: Google OAuth2 (...)
 *     Client ID: 123-abc.apps.googleusercontent.com
 *     Client secret: GOCSPX-...
 *
 * Section ids and field labels are the ones written by the page (`connect-apps.ts` in SMB-automation).
 * Keep both sides in sync when a label changes.
 */
export interface SheetApp {
  id: string;
  /** The page marks apps with missing required fields as "(incomplete)". */
  incomplete: boolean;
  /** Label → value. Empty values ("-" on the sheet) are left out. */
  fields: Record<string, string>;
}

export interface ConnectionSheet {
  redirectUri?: string;
  apps: SheetApp[];
}

const SECTION = /^\[([a-z0-9-]+)\](\s*\(incomplete\))?\s*$/i;
const FIELD = /^\s+([^:]+?):\s*(.*)$/;
const REDIRECT = /^n8n redirect URI:\s*(\S+)\s*$/i;

export function parseConnectionSheet(text: string): ConnectionSheet {
  const sheet: ConnectionSheet = { apps: [] };
  let current: SheetApp | undefined;

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;

    const redirect = REDIRECT.exec(line.trim());
    if (redirect) {
      sheet.redirectUri = redirect[1];
      continue;
    }

    const section = SECTION.exec(line.trim());
    if (section) {
      current = { id: section[1]!.toLowerCase(), incomplete: Boolean(section[2]), fields: {} };
      sheet.apps.push(current);
      continue;
    }

    // Field lines are indented; "n8n credential:" lines are not, so they are skipped here.
    const field = FIELD.exec(line);
    if (field && current) {
      const value = field[2]!.trim();
      if (value && value !== '-') current.fields[field[1]!.trim()] = value;
    }
  }
  return sheet;
}
