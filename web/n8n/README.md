# Connections: customers connect their accounts without opening n8n

```
Angular  /app/connections ──POST (Firebase ID token)──▶ n8n webhook /webhook/ah-connections
                                                         │  verifies the token → tenantId
                                                         │  n8n public API: create / list / delete credentials
                                                         │  n8n REST: get the OAuth consent URL
Popup ◀───────────── Google consent URL ─────────────────┘
  └─ customer approves ─▶ n8n /rest/oauth2-credential/callback  (n8n stores + refreshes the tokens)
Angular polls "status" until the credential has tokens ✅
```

Credentials are named `<Service> · <tenantId>`, for example `Gmail · acme-agency`, so you can see in
n8n which customer each credential belongs to.

## Why it works this way

n8n doesn't allow setting OAuth tokens through its API. The public API rejects unknown fields, and the
internal API strips `oauthTokenData`. So your site can't do the Google exchange itself and pass the tokens
to n8n. Instead, n8n's own OAuth callback receives the tokens. The customer only sees Google's consent
screen and a "Connection successful" popup.

## One-time setup

1. **Import** `connections-api.workflow.json` into n8n (Workflows → Import from file).
2. **Fill in `CONFIG`** at the top of the *Handle request* Code node:
   - `n8nApiKey`: Settings → n8n API → Create API key. Create it as the owner or an admin user.
   - `n8nLoginEmail` / `n8nLoginPassword`: the same user. Turn MFA off for this user, or create a dedicated
     admin user for it.
   - `firebaseWebApiKey`: the `apiKey` from `src/environments/firebase.config.ts`.
   - `google.clientId` / `clientSecret`: from Google Cloud → APIs & Services → Credentials → OAuth client
     (Web application).
3. **Google Cloud OAuth client**: add the authorized redirect URI
   `https://n8n.34-71-188-154.sslip.io/rest/oauth2-credential/callback`. Then enable the Gmail API, Google
   Sheets API, Google Drive API and Firebase Realtime Database API. On the OAuth consent screen, add your
   customers as test users until Google verifies the app.
4. **n8n server env**: set `N8N_SKIP_AUTH_ON_OAUTH_CALLBACK=true` and restart n8n. Without it, n8n's
   callback requires the person approving to be logged into n8n, and your customers aren't. Leave
   `N8N_OAUTH_BROWSER_BINDING` unset (it defaults to false).
5. **Activate** the workflow.
6. **Angular**: `npm run start:live-auth`, then open **Connections** in the side menu. Locally,
   `proxy.conf.json` forwards `/ah-connections` to n8n. In production the app calls n8n directly; the
   webhook allows `https://ytakok.github.io` and `http://localhost:4200` (CORS option on the Webhook node).

## Adding a service

- Add an entry to `P` in the Code node (`kind: 'oauth'` or `'apiKey'` plus the n8n credential type).
- Add an entry to `PROVIDERS` in `connections.page.ts` with the same id.
- Add texts under `connections.providers.<id>` in `public/i18n/en.json` and `he.json`.
- To find the field names a type needs: `GET /api/v1/credentials/schema/<type>` with your API key.
- For a non-Google OAuth service (HubSpot OAuth, Microsoft, Slack…), add its client to `CONFIG`, add the
  same n8n callback URL as a redirect URI in that provider's developer app, and use `client: '<name>'`.

## Security notes

- Execution saving is turned off for this workflow, so pasted keys never appear under Executions.
- Every call verifies the Firebase ID token and reads `tenantId` from its custom claims. A customer can only
  see and change their own organization's credentials. Set `allowedRoles` to restrict this to admins.
- Move the secrets in `CONFIG` into n8n Variables or environment variables when you can.
