// AgencyHub · Connections API — the code inside the "Handle request" Code node.
// (Readable copy only — connections-api.workflow.json already contains this code. Edit it in n8n.)
//
// One POST endpoint: { action: 'status' | 'start' | 'saveKey' | 'disconnect', provider?, fields? }
// Header: Authorization: Bearer <Firebase ID token>
//
// The customer never logs into n8n:
//  - OAuth services: we create the credential through the n8n public API, ask n8n for its Google/HubSpot
//    consent URL, and the customer approves it in a popup. n8n's own callback stores and refreshes the tokens.
//  - API-key services: we create the credential with the pasted key and test it before keeping it.

// ─── CONFIG — fill these in (move secrets to n8n Variables or env vars when you can) ─────────────────────────
const C = {
  n8nBaseUrl: 'https://n8n.34-71-188-154.sslip.io',
  /** Settings → n8n API → Create API key (owner/admin user). */
  n8nApiKey: 'PASTE_N8N_API_KEY',
  /**
   * An n8n login (owner or a dedicated admin user, MFA off). Only used to ask n8n for the OAuth consent URL
   * — n8n doesn't expose that through its public API. Must be the same user as the API key above.
   */
  n8nLoginEmail: 'PASTE_N8N_LOGIN_EMAIL',
  n8nLoginPassword: 'PASTE_N8N_LOGIN_PASSWORD',
  /** Firebase console → Project settings → Web API key (public value, same one the Angular app uses). */
  firebaseWebApiKey: 'PASTE_FIREBASE_WEB_API_KEY',
  /** Google Cloud OAuth client (Web application). Redirect URI: <n8nBaseUrl>/rest/oauth2-credential/callback */
  google: { clientId: 'PASTE_GOOGLE_CLIENT_ID', clientSecret: 'PASTE_GOOGLE_CLIENT_SECRET' },
  /** Roles allowed to manage connections. Empty = any signed-in member of the organization. */
  allowedRoles: [],
};

// Add a service = add one entry here (and one in the Angular PROVIDERS list).
const P = {
  gmail: { label: 'Gmail', kind: 'oauth', type: 'gmailOAuth2', client: 'google' },
  googleSheets: { label: 'Google Sheets', kind: 'oauth', type: 'googleSheetsOAuth2Api', client: 'google' },
  firebase: { label: 'Firebase Realtime DB', kind: 'oauth', type: 'googleFirebaseRealtimeDatabaseOAuth2Api', client: 'google' },
  hubspot: { label: 'HubSpot', kind: 'apiKey', type: 'hubspotAppToken', fields: ['appToken'] },
  gemini: {
    label: 'Google Gemini',
    kind: 'apiKey',
    type: 'googlePalmApi',
    fields: ['apiKey'],
    defaults: { host: 'https://generativelanguage.googleapis.com' },
  },
  // HubSpot via OAuth instead of a private-app token (needs a HubSpot public app):
  // hubspot: { label: 'HubSpot', kind: 'oauth', type: 'hubspotOAuth2Api', client: 'hubspot' },  + C.hubspot = { clientId, clientSecret }
};

// ─── plumbing ─────────────────────────────────────────────────────────────────────────────────────────────
const req = $input.first().json;
const body = req.body || {};
const reply = (status, payload) => [{ json: { status, body: payload } }];
const fail = (status, error, detail) => reply(status, { ok: false, error, ...(detail ? { detail: String(detail).slice(0, 300) } : {}) });

const http = (opts) =>
  this.helpers.httpRequest({ json: true, ...opts, returnFullResponse: true, ignoreHttpStatusErrors: true });

/** n8n public API (stable, documented). */
const api = (method, path, payload) =>
  http({ method, url: `${C.n8nBaseUrl}/api/v1${path}`, headers: { 'X-N8N-API-KEY': C.n8nApiKey }, body: payload });

/** n8n internal REST, used only for the OAuth consent URL and the "is it connected yet" check. */
const BROWSER_ID = 'agencyhub-connections-api';
const store = $getWorkflowStaticData('global');
const login = async () => {
  const r = await http({
    method: 'POST',
    url: `${C.n8nBaseUrl}/rest/login`,
    headers: { 'browser-id': BROWSER_ID },
    body: { emailOrLdapLoginId: C.n8nLoginEmail, password: C.n8nLoginPassword },
  });
  if (r.statusCode !== 200) throw new Error(`n8n login failed (${r.statusCode})`);
  const cookie = []
    .concat(r.headers['set-cookie'] || [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('n8n-auth='));
  if (!cookie) throw new Error('n8n login returned no session cookie');
  store.n8nCookie = cookie; // reused across executions so we don't hit the login rate limit
};
const rest = async (method, path, payload, retry = true) => {
  if (!store.n8nCookie) await login();
  const r = await http({
    method,
    url: `${C.n8nBaseUrl}/rest${path}`,
    headers: { cookie: store.n8nCookie, 'browser-id': BROWSER_ID },
    body: payload,
  });
  if (r.statusCode === 401 && retry) {
    store.n8nCookie = null;
    return rest(method, path, payload, false);
  }
  return r;
};

try {
  // ─── 1. Who is calling? Verify the Firebase ID token and read the tenant from its custom claims ─────────
  const authz = String(req.headers?.authorization || '');
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!idToken) return fail(401, 'unauthenticated');

  const lookup = await http({
    method: 'POST',
    url: `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(C.firebaseWebApiKey)}`,
    body: { idToken },
  });
  const user = lookup.body?.users?.[0];
  if (lookup.statusCode !== 200 || !user) return fail(401, 'invalid_token');

  let claims = {};
  try {
    claims = JSON.parse(user.customAttributes || '{}');
  } catch {
    claims = {};
  }
  const tenantId = typeof claims.tenantId === 'string' ? claims.tenantId : '';
  if (!tenantId) return fail(403, 'no_tenant');
  if (C.allowedRoles.length && !C.allowedRoles.includes(claims.role) && claims.platformAdmin !== true) {
    return fail(403, 'forbidden');
  }

  // Setup check: tell the page exactly which CONFIG values are still placeholders.
  const missing = Object.entries({
    n8nApiKey: C.n8nApiKey,
    n8nLoginEmail: C.n8nLoginEmail,
    n8nLoginPassword: C.n8nLoginPassword,
    'google.clientId': C.google.clientId,
    'google.clientSecret': C.google.clientSecret,
  })
    .filter(([, v]) => !v || String(v).startsWith('PASTE_'))
    .map(([k]) => k);
  if (missing.length) return fail(503, 'not_configured', `Missing in CONFIG: ${missing.join(', ')}`);

  // ─── 2. This tenant's credentials (named "<Service> · <tenantId>") ──────────────────────────────────────
  const credName = (id) => `${P[id].label} · ${tenantId}`;
  const listCreds = async () => {
    const all = [];
    let cursor = null;
    do {
      const r = await api('GET', `/credentials?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (r.statusCode !== 200) throw new Error(`n8n API: list credentials failed (${r.statusCode}) ${JSON.stringify(r.body)}`);
      all.push(...(r.body.data || []));
      cursor = r.body.nextCursor;
    } while (cursor);
    return all;
  };
  const mine = (creds, id) => creds.filter((c) => c.name === credName(id) && c.type === P[id].type);
  const hasTokens = async (credId) => {
    const r = await rest('GET', `/credentials/${credId}?includeData=true`);
    return r.statusCode === 200 && Boolean(r.body?.data?.data?.oauthTokenData);
  };
  const createCred = async (id, data) => {
    const r = await api('POST', '/credentials', { name: credName(id), type: P[id].type, data });
    if (r.statusCode >= 300) throw new Error(`n8n API: create credential failed (${r.statusCode}) ${JSON.stringify(r.body)}`);
    return r.body.id;
  };

  const action = body.action;
  const providerId = body.provider;
  const provider = providerId ? P[providerId] : null;
  if (action !== 'status' && !provider) return fail(400, 'unknown_provider');

  // ─── 3. Actions ─────────────────────────────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const creds = await listCreds();
    const providers = {};
    for (const id of Object.keys(P)) {
      const c = mine(creds, id)[0];
      const connected = !c ? false : P[id].kind === 'apiKey' ? true : await hasTokens(c.id);
      providers[id] = { connected, credentialId: c?.id ?? null, updatedAt: c?.updatedAt ?? null };
    }
    return reply(200, { ok: true, tenantId, providers });
  }

  if (action === 'start') {
    if (provider.kind !== 'oauth') return fail(400, 'not_oauth');
    const client = C[provider.client];
    if (!client?.clientId || client.clientId.startsWith('PASTE_')) return fail(500, 'oauth_client_missing');

    const existing = mine(await listCreds(), providerId)[0];
    const credId = existing?.id ?? (await createCred(providerId, { clientId: client.clientId, clientSecret: client.clientSecret }));

    const r = await rest('GET', `/oauth2-credential/auth?id=${encodeURIComponent(credId)}`);
    const url = r.body?.data;
    if (r.statusCode !== 200 || typeof url !== 'string') {
      return fail(502, 'oauth_url_failed', `${r.statusCode} ${JSON.stringify(r.body)}`);
    }
    return reply(200, { ok: true, url, credentialId: credId });
  }

  if (action === 'saveKey') {
    if (provider.kind !== 'apiKey') return fail(400, 'not_api_key');
    const fields = body.fields || {};
    const data = { ...(provider.defaults || {}) };
    for (const f of provider.fields) {
      const v = typeof fields[f] === 'string' ? fields[f].trim() : '';
      if (!v || v.length > 4096) return fail(400, 'missing_field', f);
      data[f] = v;
    }

    const old = mine(await listCreds(), providerId);
    const credId = await createCred(providerId, data);

    // Test before keeping it. Older n8n versions don't have this endpoint (404) — then we skip the test.
    const test = await api('POST', `/credentials/${credId}/test`);
    if (test.statusCode === 200 && test.body?.status === 'Error') {
      await api('DELETE', `/credentials/${credId}`);
      return fail(422, 'test_failed', test.body.message);
    }
    for (const c of old) await api('DELETE', `/credentials/${c.id}`); // replaced
    return reply(200, { ok: true, credentialId: credId, tested: test.statusCode === 200 });
  }

  if (action === 'disconnect') {
    for (const c of mine(await listCreds(), providerId)) await api('DELETE', `/credentials/${c.id}`);
    return reply(200, { ok: true });
  }

  return fail(400, 'unknown_action');
} catch (e) {
  return fail(500, 'server_error', e?.message ?? e);
}
