# Agency Hub: context for coding agents

This is a multi-tenant SaaS dashboard for insurance agencies and SMBs. It uses npm workspaces:
- `shared/`: types only, always imported with `import type`.
- `api/`: NestJS 12, ESM. Relative imports need `.js` extensions.
- `web/`: Angular 22.

## Non-negotiables
- **Credentials:** passwords are handled only by Firebase Auth. Never store credentials or tokens in Firestore.
- **Tenant identity:** `tenantId`, `role` and `platformAdmin` come from verified custom claims (`FirebaseAuthGuard`). Never read the tenant from params, query or body (the platform-admin flag route is the one exception).
- **Writes:** all writes go through the API. `firestore.rules` deny client writes.
- **Integrations:** each external source sits behind an interface in `api/src/integrations/provider.types.ts`, with Mock and Live implementations chosen by `DATA_MODE`. Mock mode must keep working offline.
- **Feature flags:** gate routes with `@RequireFeature(...)` (API) and with `featureGuard` / `*ahFeature` (web). Hiding something in the UI is UX, not security.
- **RTL:** use CSS logical properties only, never `left`/`right`. Hebrew is the default (RTL); English is also supported.
- **Mobile first:** base styles target about 360px; enhance with `.from(@md, {...})` from `src/styles/breakpoints.less`.
- **Styling:** use the LESS tokens in `src/styles/tokens.less`, which map to CSS variables written by `ThemeService`. Never hard-code brand colors.
- **Angular style:** standalone components, OnPush, signals, `inject()`, the new control flow, and `httpResource` for reads.
- **Errors:** never echo internal errors to clients (see `AllExceptionsFilter`). Logs redact authorization headers, tokens and passwords.

## Where things are
- **Firestore data model:** `docs/firestore-model.md`
- **API pipeline:** throttler → auth → tenant → roles → feature guard, then the audit interceptor (`api/src/app.module.ts`)
- **Web core:** `web/src/app/core/` (auth, theme, i18n, tenant config + flags, interceptor)
- **Seed (emulator only):** `api/scripts/seed-dev.ts`

## Commands
`npm run dev` · `npm run seed` · `npm test` · `npm run build`

## Next phases
1. Firestore rules unit tests (`@firebase/rules-unit-testing`) and a fuller seed.
2. `POST /api/ingest/:source` with HMAC and timestamp checks, idempotent by `externalId`; WhatsApp webhook verification; n8n workflow exports in `n8n/workflows/`.
3. Live providers, invitations UI, MFA, deployment (Cloud Run + Firebase Hosting).
