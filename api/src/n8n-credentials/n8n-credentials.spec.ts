import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { parseConnectionSheet } from './connection-sheet.js';
import { buildCredentialPlan, maskValue } from './credential-plan.js';
import { N8nApiClient, N8nApiError } from './n8n-api.client.js';
import { N8nCredentialsService } from './n8n-credentials.service.js';

/** Same format the SMB Automation /connect page writes (Windows line endings on purpose). */
const SHEET = [
  'Connection sheet for SMB Automation',
  'n8n redirect URI: https://n8n.example.io/rest/oauth2-credential/callback',
  '',
  '[whatsapp]',
  'n8n credential: WhatsApp API (Access Token + Business Account ID); WhatsApp OAuth API (App ID + App Secret)',
  '  Phone number ID: 1111222233334444',
  '  WhatsApp Business Account ID: 5555666677778888',
  '  Access token: EAAGsecretwhatsapptoken',
  '  App ID: 9999000011112222',
  '  App secret: appsecret123456',
  '',
  '[google]',
  'n8n credential: Google OAuth2 (one pair for Gmail, Google Sheets, Google Calendar and Google Drive)',
  '  Client ID: 123-abc.apps.googleusercontent.com',
  '  Client secret: GOCSPX-googlesecret',
  '',
  '[microsoft] (incomplete)',
  'n8n credential: Microsoft OAuth2 (Outlook, Excel, OneDrive, Teams)',
  '  Application (client) ID: 0000-app',
  '  Directory (tenant) ID: tenant-guid',
  '  Client secret value: -',
].join('\r\n');

describe('parseConnectionSheet', () => {
  it('reads the redirect URI, every app and its filled fields', () => {
    const sheet = parseConnectionSheet(SHEET);
    expect(sheet.redirectUri).toBe('https://n8n.example.io/rest/oauth2-credential/callback');
    expect(sheet.apps.map((a) => [a.id, a.incomplete])).toEqual([
      ['whatsapp', false],
      ['google', false],
      ['microsoft', true],
    ]);
    expect(sheet.apps[1]!.fields).toEqual({
      'Client ID': '123-abc.apps.googleusercontent.com',
      'Client secret': 'GOCSPX-googlesecret',
    });
    expect('Client secret value' in sheet.apps[2]!.fields).toBe(false);
  });

  it('keeps colons inside values', () => {
    const sheet = parseConnectionSheet('[gemini]\n  API key: a:b:c');
    expect(sheet.apps[0]!.fields['API key']).toBe('a:b:c');
  });
});

describe('buildCredentialPlan', () => {
  const plan = buildCredentialPlan(parseConnectionSheet(SHEET), '  Acme  ');

  it('maps each app to the n8n credential types and field keys', () => {
    const byType = Object.fromEntries(plan.credentials.map((c) => [c.type, c]));
    expect(Object.keys(byType)).toEqual([
      'whatsAppApi',
      'whatsAppTriggerApi',
      'gmailOAuth2',
      'googleSheetsOAuth2Api',
      'googleCalendarOAuth2Api',
      'googleDriveOAuth2Api',
    ]);
    expect(byType['whatsAppApi']!.data).toEqual({
      accessToken: 'EAAGsecretwhatsapptoken',
      businessAccountId: '5555666677778888',
    });
    expect(byType['whatsAppTriggerApi']!.data).toEqual({
      clientId: '9999000011112222',
      clientSecret: 'appsecret123456',
    });
    expect(byType['gmailOAuth2']).toMatchObject({ name: 'Acme – Gmail', needsSignIn: true });
    expect(byType['whatsAppApi']!.needsSignIn).toBe(false);
  });

  it('skips apps with missing values and says why, without secrets', () => {
    expect(plan.problems).toEqual(['Microsoft 365 was skipped: missing Client secret value.']);
    expect(plan.notes[0]).toContain('1111222233334444');
  });

  it('points Microsoft sign-in at the customer tenant when the ID is known', () => {
    const ms = buildCredentialPlan(
      parseConnectionSheet(
        '[microsoft]\n  Application (client) ID: app\n  Directory (tenant) ID: t1\n  Client secret value: s',
      ),
      'Acme',
    );
    expect(ms.credentials.map((c) => c.type)).toEqual([
      'microsoftOutlookOAuth2Api',
      'microsoftExcelOAuth2Api',
      'microsoftOneDriveOAuth2Api',
      'microsoftTeamsOAuth2Api',
    ]);
    expect(ms.credentials[0]!.data).toEqual({
      clientId: 'app',
      clientSecret: 's',
      authUrl: 'https://login.microsoftonline.com/t1/oauth2/v2.0/authorize',
      accessTokenUrl: 'https://login.microsoftonline.com/t1/oauth2/v2.0/token',
    });
  });

  it('reports unknown apps and an empty paste', () => {
    expect(buildCredentialPlan(parseConnectionSheet('[slack]\n  Token: x'), 'A').problems).toEqual([
      'Unknown app "slack" was skipped.',
    ]);
    expect(buildCredentialPlan(parseConnectionSheet('hello'), 'A').problems[0]).toMatch(/No apps found/);
  });

  it('adds the default Gemini host', () => {
    const gemini = buildCredentialPlan(parseConnectionSheet('[gemini]\n  API key: AIzaKEY'), 'A');
    expect(gemini.credentials[0]).toMatchObject({
      type: 'googlePalmApi',
      data: { host: 'https://generativelanguage.googleapis.com', apiKey: 'AIzaKEY' },
    });
  });
});

describe('maskValue', () => {
  it('never shows a whole secret', () => {
    expect(maskValue('GOCSPX-googlesecret')).toBe('GOCS…et');
    expect(maskValue('short')).toBe('••••');
    expect(maskValue('https://generativelanguage.googleapis.com')).toBe(
      'https://generativelanguage.googleapis.com',
    );
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('N8nApiClient', () => {
  it('posts credentials with the API key header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'c1', name: 'n', type: 't' }));
    const client = new N8nApiClient('https://n8n.example.io/', 'key-123', fetchFn);

    await client.createCredential({ name: 'n', type: 't', data: { a: 'b' } });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://n8n.example.io/api/v1/credentials');
    expect(init.method).toBe('POST');
    expect(init.headers['X-N8N-API-KEY']).toBe('key-123');
    expect(JSON.parse(init.body)).toEqual({ name: 'n', type: 't', data: { a: 'b' } });
    expect(client.credentialUrl('c1')).toBe('https://n8n.example.io/home/credentials/c1');
  });

  it('turns n8n errors into short messages', async () => {
    const client = new N8nApiClient(
      'https://n8n.example.io',
      'k',
      vi.fn().mockResolvedValue(jsonResponse(400, { message: 'request.body.data requires property "x"' })),
    );
    await expect(client.getSchema('t')).rejects.toMatchObject({
      status: 400,
      message: 'request.body.data requires property "x"',
    });

    const offline = new N8nApiClient(
      'https://n8n.example.io',
      'k',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );
    await expect(offline.getSchema('t')).rejects.toMatchObject({ status: 0 });
  });
});

function fakeClient(
  overrides: Partial<Record<'getSchema' | 'createCredential', ReturnType<typeof vi.fn>>> = {},
) {
  let n = 0;
  return {
    getSchema: overrides.getSchema ?? vi.fn().mockResolvedValue({ required: ['clientId', 'clientSecret'] }),
    createCredential:
      overrides.createCredential ??
      vi.fn().mockImplementation(async (c: { name: string; type: string }) => ({
        id: `id${++n}`,
        name: c.name,
        type: c.type,
      })),
    credentialUrl: (id: string) => `https://n8n.example.io/home/credentials/${id}`,
  } as unknown as N8nApiClient;
}

describe('N8nCredentialsService', () => {
  it('previews masked values and checks n8n required fields', async () => {
    const getSchema = vi
      .fn()
      .mockImplementation(async (type: string) =>
        type === 'whatsAppApi'
          ? { required: ['accessToken', 'businessAccountId'] }
          : { required: ['clientId', 'clientSecret', 'serverUrl'] },
      );
    const preview = await new N8nCredentialsService(fakeClient({ getSchema })).preview(SHEET, 'Acme');

    expect(preview.n8nConfigured).toBe(true);
    expect(JSON.stringify(preview)).not.toContain('GOCSPX-googlesecret');
    expect(JSON.stringify(preview)).not.toContain('EAAGsecretwhatsapptoken');
    const gmail = preview.credentials.find((c) => c.type === 'gmailOAuth2')!;
    expect(gmail.fields['clientSecret']).toBe('GOCS…et');
    expect(gmail.missingRequired).toEqual(['serverUrl']);
    expect(preview.credentials.find((c) => c.type === 'whatsAppApi')!.missingRequired).toEqual([]);
    expect(getSchema).toHaveBeenCalledTimes(6);
  });

  it('previews without n8n configured', async () => {
    const preview = await new N8nCredentialsService(null).preview(SHEET, 'Acme');
    expect(preview.n8nConfigured).toBe(false);
    expect(preview.credentials).toHaveLength(6);
  });

  it('creates every credential and reports failures one by one', async () => {
    const createCredential = vi.fn().mockImplementation(async (c: { name: string; type: string }) => {
      if (c.type === 'googleDriveOAuth2Api') throw new N8nApiError(400, 'request.body.data is not valid');
      return { id: `id-${c.type}`, name: c.name, type: c.type };
    });
    const result = await new N8nCredentialsService(fakeClient({ createCredential })).import(SHEET, 'Acme');

    expect(result.created).toHaveLength(5);
    expect(result.created[2]).toMatchObject({
      name: 'Acme – Gmail',
      url: 'https://n8n.example.io/home/credentials/id-gmailOAuth2',
      needsSignIn: true,
    });
    expect(result.failed).toEqual([
      { name: 'Acme – Google Drive', type: 'googleDriveOAuth2Api', error: 'request.body.data is not valid' },
    ]);
    expect(createCredential.mock.calls[2]![0]).toEqual({
      name: 'Acme – Gmail',
      type: 'gmailOAuth2',
      data: { clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-googlesecret' },
    });
  });

  it('stops at once when n8n rejects the API key or is unreachable', async () => {
    const createCredential = vi.fn().mockRejectedValue(new N8nApiError(401, 'n8n rejected the API key.'));
    await expect(
      new N8nCredentialsService(fakeClient({ createCredential })).import(SHEET, 'Acme'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(createCredential).toHaveBeenCalledTimes(1);
  });

  it('refuses to import without n8n, without apps, or with a bad customer name', async () => {
    await expect(new N8nCredentialsService(null).import(SHEET, 'Acme')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      new N8nCredentialsService(fakeClient()).import('nothing here', 'Acme'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(new N8nCredentialsService(fakeClient()).preview(SHEET, '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
