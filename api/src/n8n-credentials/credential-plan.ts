import type { ConnectionSheet, SheetApp } from './connection-sheet.js';

/**
 * Which n8n credentials to create for each app on the connection sheet.
 * Type names and data keys match n8n's credential definitions
 * (packages/nodes-base/credentials/*.credentials.ts and @n8n/nodes-langchain/credentials).
 */
export interface PlannedCredential {
  appId: string;
  name: string;
  type: string;
  data: Record<string, string>;
  /** OAuth2: after creating, someone must click "Sign in" in n8n with the customer's account. */
  needsSignIn: boolean;
}

export interface CredentialPlan {
  credentials: PlannedCredential[];
  /** Human-readable problems: unknown apps, missing values. Never contains secret values. */
  problems: string[];
  /** Things to do by hand afterwards (e.g. which WhatsApp number to pick in the node). */
  notes: string[];
}

type Read = (label: string) => string | undefined;
type Built = Omit<PlannedCredential, 'appId'>;

interface AppRecipe {
  label: string;
  build(read: Read, customer: string): Built[];
}

const GOOGLE_TYPES: Array<[type: string, label: string]> = [
  ['gmailOAuth2', 'Gmail'],
  ['googleSheetsOAuth2Api', 'Google Sheets'],
  ['googleCalendarOAuth2Api', 'Google Calendar'],
  ['googleDriveOAuth2Api', 'Google Drive'],
];

const MICROSOFT_TYPES: Array<[type: string, label: string]> = [
  ['microsoftOutlookOAuth2Api', 'Outlook'],
  ['microsoftExcelOAuth2Api', 'Excel'],
  ['microsoftOneDriveOAuth2Api', 'OneDrive'],
  ['microsoftTeamsOAuth2Api', 'Teams'],
];

const RECIPES: Record<string, AppRecipe> = {
  whatsapp: {
    label: 'WhatsApp',
    build: (read, customer): Built[] => [
      {
        name: `${customer} – WhatsApp`,
        type: 'whatsAppApi',
        data: {
          accessToken: read('Access token')!,
          businessAccountId: read('WhatsApp Business Account ID')!,
        },
        needsSignIn: false,
      },
      {
        name: `${customer} – WhatsApp Trigger`,
        type: 'whatsAppTriggerApi',
        data: { clientId: read('App ID')!, clientSecret: read('App secret')! },
        needsSignIn: false,
      },
    ],
  },
  google: {
    label: 'Google',
    build: (read, customer) =>
      GOOGLE_TYPES.map(([type, label]) => ({
        name: `${customer} – ${label}`,
        type,
        data: { clientId: read('Client ID')!, clientSecret: read('Client secret')! },
        needsSignIn: true,
      })),
  },
  microsoft: {
    label: 'Microsoft 365',
    build: (read, customer) => {
      // n8n defaults to the /common endpoint, which only works for multitenant app registrations.
      // With the tenant ID we point sign-in at the customer's directory, so single-tenant apps work too.
      const tenant = read('Directory (tenant) ID');
      const endpoints: Record<string, string> = tenant
        ? {
            authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
            accessTokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
          }
        : {};
      return MICROSOFT_TYPES.map(([type, label]) => ({
        name: `${customer} – ${label}`,
        type,
        data: {
          clientId: read('Application (client) ID')!,
          clientSecret: read('Client secret value')!,
          ...endpoints,
        },
        needsSignIn: true,
      }));
    },
  },
  hubspot: {
    label: 'HubSpot',
    build: (read, customer): Built[] => [
      {
        name: `${customer} – HubSpot`,
        type: 'hubspotAppToken',
        data: { appToken: read('Access token')! },
        needsSignIn: false,
      },
    ],
  },
  pipedrive: {
    label: 'Pipedrive',
    build: (read, customer): Built[] => [
      {
        name: `${customer} – Pipedrive`,
        type: 'pipedriveApi',
        data: { apiToken: read('API token')! },
        needsSignIn: false,
      },
    ],
  },
  gemini: {
    label: 'Gemini',
    build: (read, customer): Built[] => [
      {
        name: `${customer} – Gemini`,
        type: 'googlePalmApi',
        data: { host: 'https://generativelanguage.googleapis.com', apiKey: read('API key')! },
        needsSignIn: false,
      },
    ],
  },
};

/** Labels each app must have filled in; anything else on the sheet is optional. */
const REQUIRED: Record<string, string[]> = {
  whatsapp: ['Access token', 'WhatsApp Business Account ID', 'App ID', 'App secret'],
  google: ['Client ID', 'Client secret'],
  microsoft: ['Application (client) ID', 'Client secret value'],
  hubspot: ['Access token'],
  pipedrive: ['API token'],
  gemini: ['API key'],
};

export const SUPPORTED_APPS = Object.keys(RECIPES);

export function buildCredentialPlan(sheet: ConnectionSheet, customerName: string): CredentialPlan {
  const customer = customerName.trim();
  const plan: CredentialPlan = { credentials: [], problems: [], notes: [] };
  if (!sheet.apps.length)
    plan.problems.push('No apps found. Paste the whole connection sheet, including the [app] lines.');

  for (const app of sheet.apps) {
    const recipe = RECIPES[app.id];
    if (!recipe) {
      plan.problems.push(`Unknown app "${app.id}" was skipped.`);
      continue;
    }
    const missing = (REQUIRED[app.id] ?? []).filter((label) => !app.fields[label]);
    if (missing.length) {
      plan.problems.push(`${recipe.label} was skipped: missing ${missing.join(', ')}.`);
      continue;
    }
    const read: Read = (label) => app.fields[label];
    for (const credential of recipe.build(read, customer))
      plan.credentials.push({ appId: app.id, ...credential });
    plan.notes.push(...notesFor(app));
  }
  return plan;
}

function notesFor(app: SheetApp): string[] {
  if (app.id === 'whatsapp' && app.fields['Phone number ID']) {
    return [
      `WhatsApp: pick phone number ID ${app.fields['Phone number ID']} as the sender in the WhatsApp node.`,
    ];
  }
  return [];
}

/** Shows enough of a value to recognize it, never enough to use it. */
export function maskValue(value: string): string {
  if (value.startsWith('https://')) return value;
  return value.length <= 8 ? '••••' : `${value.slice(0, 4)}…${value.slice(-2)}`;
}
