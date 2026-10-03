# Agency Hub

A white-label, multi-tenant dashboard for insurance agencies and similar small businesses. It pulls together CRM, Google Sheets, Gmail and WhatsApp in one place.

| Layer | Stack |
|---|---|
| Web | Angular 22 (standalone, signals, zoneless, lazy routes), LESS + CSS custom properties, ngx-translate (he/en, RTL/LTR), ECharts |
| API | NestJS 12 (ESM), Firebase Admin, zod-validated config, helmet, throttler, pino |
| Data / auth | Firebase Auth + Firestore (local: Emulator Suite) |
| Integrations | Mock providers today; live providers or n8n later |
| Shared | `@agency-hub/shared`: types/DTO contracts used by both apps |

## Quick start (mock mode, fully offline)

**Prerequisites**
- Node 22+
- Java 11+, needed by the Firebase emulators: `winget install EclipseAdoptium.Temurin.21.JRE`

```bash
npm install
cp api/.env.example api/.env      # already done if you cloned this folder as-is
npm run emulators                 # terminal 1: Auth :9099, Firestore :8080, UI :4000
npm run seed                      # terminal 2, once: demo tenants, users, flags
npm run dev:no-emu                # terminal 2: API :3000 + web :4200
```

Or run everything in one terminal with `npm run dev`, and then `npm run seed` the first time.

Open http://localhost:4200.

### Demo logins (emulator only)

All demo users share the password `Passw0rd!demo`.

| User | Username | Tenant / role | Shows |
|---|---|---|---|
| owner@demo-insurance.test | `dana` | Demo Insurance (pro) / owner | All widgets, Hebrew |
| agent@demo-insurance.test | `yossi` | Demo Insurance / agent | Read-only org settings |
| owner@acme-agency.test | `acme` | Acme (starter) / owner | No Gmail/WhatsApp (plan), activity feed off (override), English, orange brand |
| admin@platform.test | `admin` | Platform admin | Can toggle feature flags per tenant in Settings |

To see each tenant's pre-login branding, use `?tenant=acme-agency` or `?tenant=demo-insurance`. In production the tenant comes from the subdomain.

### Testing email flows locally

The Auth emulator doesn't send email. It prints the links in the emulator terminal and shows them in the Emulator UI (http://127.0.0.1:4000/auth).

To test this app's pages, copy the `oobCode` from a link and open:
- http://localhost:4200/auth/action?mode=resetPassword&oobCode=CODE
- http://localhost:4200/auth/action?mode=verifyEmail&oobCode=CODE

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Emulators + API + web |
| `npm run seed` | Seed emulators (refuses to run against a real project) |
| `npm test` | API (vitest) + web (vitest) unit tests |
| `npm run build` | Production builds of both apps |
| `npm run lint` | oxlint on the API |

API docs (dev only): http://localhost:3000/api/docs

## How it works

### Request path
```
Angular ── Bearer ID token (+ App Check) ──► NestJS
  ThrottlerGuard → FirebaseAuthGuard (verifyIdToken, checkRevoked) → TenantGuard (tenant from claims only)
  → RolesGuard → FeatureGuard (@RequireFeature) → controller → provider (mock | live)
```

### Feature flags per customer
Effective flags = code defaults (`api/src/feature-flags/flag-definitions.ts`), then `featureFlags/{key}` in Firestore (global), gated by the tenant's **plan**, then `tenants/{tid}/config/features.overrides` (per tenant).

- **API:** add `@RequireFeature('module.messages')` to a controller or route.
- **Web:** use `*ahFeature="'integration.whatsapp'"`, the `featureGuard('module.customers')` route guard, or `TenantConfigService.isEnabled()`.
- **Changing flags:** platform admins (custom claim `platformAdmin`) toggle them in Settings, which calls `PATCH /api/tenants/:id/features`. Tenant owners and admins edit settings (renewal window, SLA, dashboard widgets) via `PATCH /api/tenants/current/settings`.
- **Adding a flag:** add the key to `FeatureKey` in `shared/src/index.ts`, add a definition in `flag-definitions.ts`, then add translations under `features.*`.

### White-label theming
- **Pre-login:** `web/public/tenants/{slug}/theme.config.json` (colors, font, radius, logo, languages, which auth methods to show).
- **After login:** `tenants/{tid}.branding` from Firestore is applied on top.
- **Mechanism:** `ThemeService` writes CSS custom properties on `:root`, and every LESS token (`src/styles/tokens.less`) reads `var(--…)`. Re-branding therefore needs no rebuild.
- **Adding a company:** create a folder under `web/public/tenants/` and a tenant doc in Firestore.

### RTL / LTR
`LanguageService` sets `<html lang dir>`. All styles use logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`), so the layout mirrors with no per-component RTL code. Charts mirror their axes explicitly.

### Going live with an integration
1. Implement the provider in `api/src/integrations/live/live-providers.ts`, keeping the interface in `provider.types.ts`.
2. Keep credentials in GCP Secret Manager, with only a `secretRef` in `tenants/{tid}/integrations/{source}`.
3. Set `DATA_MODE=live`.

The next phase adds `POST /api/ingest/:source` (HMAC-signed) so n8n can own the connectors and push normalized data.

## Production checklist

- **Firebase project:**
  - Create the project and fill in `web/src/environments/environment.ts`.
  - Deploy `firestore.rules` and `firestore.indexes.json` (`firebase deploy --only firestore`).
- **Auth settings** (Firebase console → Authentication → Settings):
  - Password policy, matching `web/src/app/features/auth/password.ts`.
  - Email enumeration protection on.
  - Authorized domains.
  - Email templates' **action URL** set to `https://<your-domain>/auth/action`.
- **App Check:** reCAPTCHA Enterprise, with its site key in `environment.ts`. Enforce it on the API by verifying `X-Firebase-AppCheck`.
- **API on Cloud Run:**
  - Set `NODE_ENV=production`, `CORS_ORIGINS`, `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY`.
  - Remove the emulator hosts; the API refuses to start with them in production.
- **MFA:** optional, requires Identity Platform.
- **Gmail API:** `gmail.readonly` is a restricted scope, so production needs Google OAuth verification and a yearly security assessment.

## Known environment notes (this machine)
- The project is in OneDrive. Exclude `node_modules` from sync, or move the repo out of OneDrive, to avoid slow installs and locked files.
- `vite` is pinned to 8.3.0 (root `overrides`). Windows Application Control blocks the newer rolldown native binary that vite 8.3.2 pulls in. Remove the override when the policy allows it.
