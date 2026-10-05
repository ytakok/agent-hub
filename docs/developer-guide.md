# Agency Hub: Developer Guide

This guide is for developers continuing work on this codebase. It explains how the frontend is wired and why. It also covers what you need to know about the API, which you'll touch whenever you add data. It finishes with step-by-step recipes for the most common changes.

Other docs:
- [README](../README.md): setup and demo logins
- [Firestore data model](firestore-model.md): collections and claims
- [CLAUDE.md](../CLAUDE.md): the rules in short form

---

## Contents

1. [The 2-minute mental model](#1-the-2-minute-mental-model)
2. [Repository layout](#2-repository-layout)
3. [Running and debugging](#3-running-and-debugging)
4. [Frontend architecture](#4-frontend-architecture)
   - 4.1 Bootstrap sequence
   - 4.2 `core/` services
   - 4.3 Routing and guards
   - 4.4 Calling the API
   - 4.5 Feature flags in the UI
   - 4.6 Styling: LESS, tokens, theming
   - 4.7 RTL / LTR
   - 4.8 i18n
   - 4.9 Shared UI building blocks
   - 4.10 Pages and dashboard widgets
5. [Backend essentials (for frontend devs)](#5-backend-essentials-for-frontend-devs)
6. [Recipes](#6-recipes)
7. [Testing](#7-testing)
8. [Conventions checklist](#8-conventions-checklist)
9. [Gotchas we've already hit](#9-gotchas-weve-already-hit)
10. [Roadmap](#10-roadmap)

---

## 1. The 2-minute mental model

```
Browser (Angular 22)                         API (NestJS 12)                      Firebase
───────────────────                          ───────────────                      ────────
Firebase Auth SDK  ── sign in ──────────────────────────────────────────────────► Auth
        │ ID token (has custom claims: tenantId, role, platformAdmin)
        ▼
authInterceptor ── Authorization: Bearer <token> ──► guards ─► controller ─► Firestore (Admin SDK)
                                                                  │
                                                                  └─► Integration provider
                                                                      (Mock today, Live later)
```

Five ideas explain almost everything:

1. **Firebase Auth owns identity.** The browser signs in with the Firebase SDK and sends the ID token to our API. Passwords never touch our code or Firestore.
2. **Tenant and role live in the token.** After signup, the API sets custom claims (`tenantId`, `role`), and every API call is scoped by them. The browser never says which tenant it is.
3. **The browser never writes to Firestore.** All reads the UI needs go through the API (`/api/...`), and all writes too. The security rules deny client writes.
4. **Each customer (tenant) shapes the UI at runtime**, through three things:
   - **branding:** CSS variables
   - **feature flags:** which pages and widgets exist
   - **settings:** widget order, SLA, renewal window

   All three come from `GET /api/tenants/current/config`.
5. **Everything flips between RTL and LTR by setting `<html dir>`.** Styles use logical CSS properties only.

---

## 2. Repository layout

```
AgencyHub/
├─ package.json            npm workspaces + root scripts (dev, seed, test, build)
├─ shared/src/index.ts     ★ Types shared by web + api (DTOs, FeatureKey, DashboardSummary…)
├─ web/                    Angular 22 app
│  ├─ public/
│  │  ├─ i18n/he.json, en.json            translations
│  │  └─ tenants/<slug>/theme.config.json  per-company branding (pre-login)
│  ├─ proxy.conf.json      /api → http://localhost:3000 in dev
│  └─ src/
│     ├─ environments/     environment.ts (prod) / environment.development.ts (emulators)
│     ├─ styles.less       global styles + form/button/badge primitives
│     ├─ styles/           tokens.less, breakpoints.less, mixins.less (importable from any component)
│     └─ app/
│        ├─ app.config.ts  providers + app initializer
│        ├─ app.routes.ts  top-level routes
│        ├─ app.ts         root component (profile language sync)
│        ├─ core/          singletons: auth, firebase, theme, i18n, tenant config, interceptor
│        ├─ layout/shell/  the signed-in frame (top bar, side nav, bottom nav)
│        ├─ shared/        reusable UI (icon, widget-card, language-switch), pipes, helpers
│        └─ features/      auth/, dashboard/, customers/, messages/, settings/
├─ api/                    NestJS 12 (ESM)
│  ├─ src/
│  │  ├─ app.module.ts     global guards/interceptor/filter order
│  │  ├─ common/           decorators, guards, filter, audit interceptor
│  │  ├─ config/           zod-validated env
│  │  ├─ firebase/         Admin SDK providers (FIRESTORE, FIREBASE_AUTH)
│  │  ├─ feature-flags/    flag definitions, TenantConfigService, FeatureGuard
│  │  ├─ integrations/     provider interfaces + mock/ + live/
│  │  └─ auth/ users/ tenants/ dashboard/ customers/ messages/   feature modules
│  └─ scripts/seed-dev.ts  emulator seed
├─ firestore.rules, firestore.indexes.json, firebase.json
└─ docs/
```

`shared` contains **types only** and has no build step. Always import it with `import type { … } from '@agency-hub/shared'`. If you add a runtime value (a constant or a function) there, the API will fail at runtime.

---

## 3. Running and debugging

```bash
npm install
npm run emulators      # terminal 1 (needs Java): Auth :9099, Firestore :8080, Emulator UI :4000
npm run seed           # once per emulator start (data is in-memory)
npm run dev:no-emu     # terminal 2: API :3000 (watch) + web :4200
```

| URL | What |
|---|---|
| http://localhost:4200 | The app. Log in as `dana` / `Passw0rd!demo` |
| http://localhost:4200/auth/login?tenant=acme-agency | Pre-login branding of another tenant |
| http://localhost:3000/api/docs | Swagger (dev only) |
| http://127.0.0.1:4000 | Emulator UI: users, claims, Firestore docs, email links |

**Debugging tips**
- **Claims:** in Emulator UI → Authentication, click a user to see their custom claims. If the UI behaves as if you have no tenant, check them there.
- **Firestore data:** Emulator UI → Firestore shows `tenants/{id}/config/features` and `settings`. Edit a value, wait about 30 seconds (the API caches tenant config), then reload.
- **API logs:** the API logs one line per request. Dashboard source failures appear as `WARN Dashboard source "gmail" failed…`.
- **Mock data language:** mock data depends on the UI language (`lang` query param), so numbers differ between Hebrew and English. That's expected.

---

## 4. Frontend architecture

**Stack:**
- Angular 22: standalone, zoneless, signals.
- Plain `firebase` JS SDK. AngularFire doesn't support Angular 22 yet.
- `@ngx-translate/core` 18 for translations.
- `ngx-echarts` + ECharts 6 for charts.
- LESS for styles.

### 4.1 Bootstrap sequence

`main.ts` bootstraps `App` with `appConfig` (`app/app.config.ts`):

1. **`provideAppInitializer`** runs **before first render**:
   1. `ThemeService.init()` works out the tenant slug (subdomain → `?tenant=` → last used → default) and loads `/tenants/<slug>/theme.config.json`. It then writes the colors, font and radius to CSS variables.
   2. `LanguageService.init(supported, default)` picks a language (saved → tenant default → browser) and sets `<html lang dir>`.

   Doing this before render avoids a flash of the wrong brand or wrong direction.
2. **`AuthService`** subscribes to `onIdTokenChanged` and restores the Firebase session. `auth.ready()` resolves once that's known, and guards await it.
3. **`TenantConfigService`** has an `effect()`: whenever `auth.tenantId()` changes, it loads `GET /api/tenants/current/config`. It stores the result in signals and re-applies branding from Firestore.
4. **`App`** (root component) loads `/users/me` when a tenant is present and applies the user's saved language. It also saves language changes back with `PATCH /users/me`.

### 4.2 `core/` services

| Service / file | Responsibility | Key API |
|---|---|---|
| `firebase/firebase.service.ts` | Owns the Firebase app/auth instances; connects to the Auth emulator in dev; App Check in prod | `auth`, `getAppCheckToken()` |
| `auth/auth.service.ts` | All auth flows + auth state as signals | `user()`, `claims()`, `tenantId()`, `role()`, `isPlatformAdmin()`, `needsOnboarding()`, `ready()`, `login()`, `loginWithGoogle()`, `signup()`, `bootstrap()`, `forgotPassword()`, `verifyResetCode()`, `confirmReset()`, `verifyEmail()`, `changePassword()`, `logout()` |
| `auth/auth.service.ts` → `authErrorKey(e)` | Maps Firebase/HTTP errors to i18n keys `auth.errors.*` | use in every auth form `catch` |
| `auth/guards.ts` | Functional guards | `authGuard`, `guestGuard`, `onboardingGuard`, `roleGuard(...roles)`, `featureGuard(...keys)` |
| `api/auth.interceptor.ts` | Adds `Authorization`, `X-Firebase-AppCheck` and `Accept-Language` to **`/api` calls only**; on 401 it refreshes the token once, then logs out | automatic |
| `theme/theme.service.ts` | Loads tenant theme, writes CSS variables | `theme()`, `logoUrl()`, `applyBranding(b)` |
| `i18n/language.service.ts` | Current language + direction | `lang()`, `dir()`, `isRtl()`, `intlLocale()`, `use(lang)` |
| `tenant/tenant-config.service.ts` | Current tenant's runtime config | `config()`, `features()`, `settings()`, `tenant()`, `isEnabled(key)`, `load(force?)`, `set(cfg)` |
| `tenant/feature.directive.ts` | `*ahFeature` structural directive | `*ahFeature="'module.messages'; else upsell"` |
| `storage.ts` | `safeStorage.get/set`: localStorage that never throws (keys prefixed `ah.`) | preferences only |

**`login(identifier, password)`** accepts either an email or a username:
- **Email:** Firebase signs in directly.
- **Username:** `POST /api/auth/login` returns a **custom token**, which is passed to `signInWithCustomToken`. The user's email is never sent to the browser.

**`signup()`** runs four steps:
1. `createUserWithEmailAndPassword`
2. `sendEmailVerification`
3. `POST /api/users/bootstrap`, which creates the profile, the username and the tenant, and sets the claims.
4. A forced token refresh, so the new claims show up in the token.

**First Google sign-in:** the user has no tenant claim yet, so `needsOnboarding()` is true and the guards send them to `/auth/complete-profile`. That page calls `bootstrap()`.

### 4.3 Routing and guards

```
/                         → redirect app/dashboard
/auth                     AuthLayout (lazy children)
  login, signup, forgot-password   guestGuard
  action                           Firebase email links (?mode=resetPassword|verifyEmail&oobCode=…)
  complete-profile                 onboardingGuard
/app                      authGuard + Shell (lazy)
  dashboard
  customers                canMatch: featureGuard('module.customers')
  messages                 canMatch: featureGuard('module.messages')
  settings
**                        → app/dashboard
```

- **Lazy loading:** every page uses `loadComponent` and the auth area uses `loadChildren`, so each page is its own chunk.
- **Route data binding:** `withComponentInputBinding()` is on, so query params map to `input()`s. For example, `LoginPage.returnUrl` and `AuthActionPage.mode/oobCode`.
- **Guard order:** `canMatch` runs **before** the parent's `canActivate`. That's why `featureGuard` awaits `auth.ready()` itself (see [Gotchas](#9-gotchas-weve-already-hit)).
- **Open redirects:** `LoginPage.safeReturnUrl()` only accepts `/app/...` paths. Keep that rule if you add redirects.

### 4.4 Calling the API

**Reads: use `httpResource`.** It's reactive: when the signals inside the request function change, it refetches.

```ts
protected readonly range = signal<DashboardRange>('30d');
protected readonly summary = httpResource<DashboardSummary>(() => ({
  url: `${environment.apiBaseUrl}/dashboard/summary`,
  params: { range: this.range(), lang: this.language.lang() },
}));

// template
@if (summary.hasValue()) { … summary.value() … }
summary.isLoading()   summary.error()   summary.reload()
```

Note that `summary.value()` **throws** when the resource is in an error state. Guard it with `hasValue()` (the pages do this with a `computed`).

**Writes: use `HttpClient` with `firstValueFrom`** inside an async method. Track `busy` and `message` signals around the call (see `SettingsPage.run()`).

**Don't** add the auth header yourself; the interceptor does it. Don't call Firestore from the browser either: add an API endpoint instead.

**Types** for request and response bodies come from `@agency-hub/shared`, so the API and the UI can't drift apart.

### 4.5 Feature flags in the UI

The flags come from `TenantConfigService.features()`: a `Record<FeatureKey, boolean>`, already resolved for the current tenant.

| Need | Use |
|---|---|
| Hide/show markup | `<section *ahFeature="'integration.whatsapp'">…</section>` or `*ahFeature="['a','b']; else other"` |
| Block a route | `canMatch: [featureGuard('module.messages')]` |
| Logic in TS | `tenantConfig.isEnabled('module.customers')` inside a `computed` (it's reactive) |
| Nav items | `layout/shell/shell.ts` → `NAV` array, `feature` field |
| Dashboard widgets | `features/dashboard/dashboard.page.ts` → `WIDGET_FEATURES` |

The UI checks are for user experience only. **Security is the API's `@RequireFeature`.** Always add both.

How a flag's effective value is resolved:
1. Start from the code default (`api/src/feature-flags/flag-definitions.ts`).
2. Apply any global change stored in Firestore `featureFlags/{key}`.
3. Apply the plan gating (`plans: ['pro','enterprise']`).
4. A per-tenant override (`tenants/{tid}/config/features.overrides`) wins over all of the above.

Platform admins toggle overrides on the Settings page.

### 4.6 Styling: LESS, tokens, theming

**Files**
- `src/styles/tokens.less`: **use these names in components** (`@color-primary`, `@space-4`, `@radius`, `@font-sm`…). Color tokens resolve to `var(--color-…)`, which `ThemeService` sets per tenant.
- `src/styles/breakpoints.less`: `@sm 576`, `@md 768`, `@lg 1024`, `@xl 1280`, plus the `.from(@bp, { … })` mixin.
- `src/styles/mixins.less`: `.card()`, `.truncate()`, `.focus-ring()`, `.visually-hidden()`.
- `src/styles.less`: global primitives shared across pages: `.field`, `.input`, `.btn` (`.primary` / `.ghost` / `.block` / `.icon`), `.alert`, `.badge`, `.page-header`, `.ltr-text`.

`angular.json` sets `stylePreprocessorOptions.includePaths: ["src/styles"]`. Every component `.less` file can therefore start with:

```less
@import (reference) 'tokens';
@import (reference) 'breakpoints';
@import (reference) 'mixins';

.panel {
  .card();
  padding: @space-4;                       // mobile first
}

.from(@md, { .panel { padding: @space-6; } });   // tablet and up
```

**Rules**
- **No hex colors in components.** Use tokens, or `color-mix(in srgb, var(--color-primary) 12%, transparent)` for tints. (Fixed brand colors of third parties, such as WhatsApp green, are acceptable and exist as tokens.)
- **Mobile first:** write base styles for about 360px, then enhance with `.from(...)`. Never use `max-width` queries.
- **Touch targets** are at least 44px tall (buttons and inputs already are).
- **Component style budget:** warning at 8 kB, error at 16 kB.

**Theming flow**

```
theme.config.json (pre-login, public)  ─┐
                                        ├─► ThemeService.applyBranding() ─► :root { --color-primary … }
Firestore tenants/{id}.branding (login)─┘                                    ▲
                                                           LESS tokens read var(--…)
```

`applyBranding` also computes `--color-primary-contrast` (black or white text, for WCAG contrast), and sets the logo signal, the `theme-color` meta tag and the favicon.

### 4.7 RTL / LTR

`LanguageService` sets `<html dir="rtl|ltr">` and the whole layout mirrors. For that to keep working:

| Do | Don't |
|---|---|
| `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-end`, `text-align: start` | `margin-left`, `right: 0`, `text-align: left` |
| Flex/grid (they follow `dir` automatically) | Absolute positioning with left/right |
| `<ah-icon name="chevron" [mirror]="true">` for directional icons | Hard-flipping icons with `transform` |
| `‹ ›` characters for prev/next (they're bidi-mirrored) | Arrow icons that don't flip |
| `.ltr-text` / `input.ltr` / `type="email|tel"` for phone numbers, emails, codes | Letting `+972-5…` render reversed |

In TypeScript, read `language.isRtl()` when a library needs to be told the direction. ECharts is one: see `widgets/crm-pipeline.ts`, which inverts the value axis and moves labels.

### 4.8 i18n

- Translation files live in `web/public/i18n/{he,en}.json` and are loaded over HTTP from `/i18n/`. **Keep both files' keys identical.**
- **Template:** `{{ 'dashboard.greeting' | translate: { name: firstName() } }}`
- **TypeScript:** `inject(TranslateService).instant('stages.new')`. Read `language.lang()` inside the `computed` so it recomputes when the language changes.
- **Key namespaces:**

  | Namespace | Used for |
  |---|---|
  | `common.*` | Shared words (save, retry, loading…) |
  | `nav.*` | Navigation |
  | `auth.*` | Auth pages; `auth.errors.*` holds the error messages |
  | `validation.*` | Form validation messages |
  | `dashboard.*` | Dashboard page chrome |
  | `kpi.*` | KPI tile labels |
  | `widgets.<name>.*` | Dashboard widgets |
  | `features.<flag.key>` | Feature names; dots in the key become nesting |
  | Enum labels | `stages.*`, `messageStatus.*`, `policyTypes.*`, `customerStatus.*`, `roles.*`, `sources.*`, `health.*` |

- **Formatting numbers, money and dates:** use the pipes in `shared/pipes/format.pipes.ts`. Always pass the locale, so they re-run when the language changes:
  - `value | num: language.intlLocale()`
  - `value | money: language.intlLocale() : 'ILS'`
  - `iso | relTime: language.intlLocale()`
  - `iso | shortDate: language.intlLocale()`

### 4.9 Shared UI building blocks

| Piece | Usage |
|---|---|
| `<ah-icon name="mail" [size]="18" [mirror]="true">` | Inline SVG icon set in `shared/ui/icon.ts`. Add new paths to `ICONS` (24×24, stroke). |
| `<ah-widget-card [title] icon [state] [accent] [emptyText] [errorText]>` | Frame for dashboard cards. `state`: `'loading' \| 'error' \| 'empty' \| 'ready'`. Project a header badge with `<span slot="badge">` (must be a direct child, not inside a multi-node `@if`). |
| `<ah-language-switch>` | Toggle (2 languages) or select (3+). |
| `blockState(block, loading, isEmpty?)` / `dataOf(block)` | `features/dashboard/widgets/block-state.ts`: turns an API `SourceBlock<T>` into a card state / data. |
| `debouncedSignal(source, ms)` | `shared/debounced-signal.ts`: e.g. search boxes. |
| `shared/list-page.less` | Shared styles for list pages (search, `.list`, `.avatar`, `.pager`). |
| Password helpers | `features/auth/password.ts`: `strongPassword`, `matchFields`, `PASSWORD_RULES`, `USERNAME_PATTERN`. |

### 4.10 Pages and dashboard widgets

**Component pattern used everywhere**

```ts
@Component({
  selector: 'ah-thing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, WidgetCard],
  template: `…`,           // inline for small components, templateUrl for larger
  styleUrl: './thing.less',
})
export class Thing {
  private readonly language = inject(LanguageService);   // inject(), not constructor params
  readonly block = input<DashboardSummary['crm']>();       // signal inputs
  protected readonly state = computed(() => …);            // derived state
}
```

**Dashboard data flow**
1. `DashboardPage` holds one `httpResource` for `/dashboard/summary`.
2. `widgets()` = `settings.dashboardWidgets` (the order) filtered by `WIDGET_FEATURES` (the flags).
3. The template loops over `widgets()` and uses `@switch` to render each widget. Each widget gets its own slice of the summary as an input, plus `loading`.
4. Each source block is `{status:'ok', data} | {status:'error', error} | {status:'disabled'}`. One failing source only breaks its own card.
5. `crmPipeline` is wrapped in `@defer (on viewport)`, so ECharts (about 1 MB) only loads when that card scrolls into view.

**Grid:**
- **Mobile:** 1 column.
- **≥ md:** 2 columns.
- **≥ xl:** 4 columns.
- **Spans:**
  - `span-all`: full width.
  - `span-2`: half width on xl.
  - `full-md`: full width on tablet.

---

## 5. Backend essentials (for frontend devs)

You'll touch the API whenever a screen needs new data.

**ESM gotcha:** relative imports in `api/` **must end in `.js`**, even though the files are `.ts` (`import { X } from './x.service.js'`).

**Request pipeline** (global, registered in `app.module.ts`):

```
ThrottlerGuard → FirebaseAuthGuard → TenantGuard → RolesGuard → FeatureGuard → controller
                 (verifies token,     (needs tenantId   (@Roles,         (@RequireFeature)
                  checks revocation,   claim unless      @PlatformAdminOnly)
                  sets req.user)       @AllowNoTenant)
→ AuditInterceptor (logs POST/PATCH/PUT/DELETE) → AllExceptionsFilter (uniform error JSON)
```

**Decorators** (`common/decorators/index.ts`)

| Decorator | Effect |
|---|---|
| `@Public()` | No auth (only `POST /auth/login` uses it) |
| `@AllowNoTenant()` | Authenticated, but no tenant needed yet (bootstrap, `GET /users/me`) |
| `@Roles('owner','admin')` | Tenant role check |
| `@PlatformAdminOnly()` | Your operators only (custom claim `platformAdmin`) |
| `@RequireFeature('module.messages')` | 403 if the tenant's flag is off |
| `@CurrentUser() user: TenantUser` | `{ uid, email, tenantId, role, platformAdmin }`, the **only** source of tenant identity |

**Endpoints today**

| Method & path | Guarding | Returns |
|---|---|---|
| `POST /api/auth/login` | public, 5/min | `{ customToken }` |
| `POST /api/users/bootstrap` | auth, no tenant | `UserProfile` |
| `GET/PATCH /api/users/me` | auth | `UserProfile` |
| `GET /api/tenants/current/config` | tenant | `TenantRuntimeConfig` |
| `PATCH /api/tenants/current/settings` | owner/admin | `TenantRuntimeConfig` |
| `PATCH /api/tenants/:id/features` | platform admin | `TenantRuntimeConfig` (`{overrides:{key: true\|false\|null}}`, null = clear) |
| `GET /api/dashboard/summary?range&lang` | tenant | `DashboardSummary` |
| `GET /api/customers?page&pageSize&search&lang` | `module.customers` | `Paginated<Customer>` |
| `GET /api/messages?channel&page&pageSize&search&lang` | `module.messages` | `Paginated<Message>` |

**Validation:** DTOs are classes using `class-validator` decorators. The global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so **an unknown field is a 400**. When you add a field in the UI, add it to the DTO too.

**Integrations**
- `integrations/provider.types.ts` defines `CrmProvider`, `SheetsProvider`, `GmailProvider` and `WhatsAppProvider`.
- `mock/` implements them from one deterministic dataset per tenant (`MockDatasetService`, regenerated every 10 minutes).
- `live/` holds stubs that throw `NotImplementedException`.
- `integrations.module.ts` → `selectProvider()` picks one or the other based on `DATA_MODE`.

---

## 6. Recipes

### 6.1 Add a new page (e.g. "Policies")

1. Create `web/src/app/features/policies/policies.page.ts`: a standalone component, OnPush, using `httpResource` for its list. Reuse `styleUrl: '../../shared/list-page.less'` if it's a list.
2. Add a route in `app.routes.ts` under the `app` children:
   ```ts
   { path: 'policies', title: 'Policies',
     canMatch: [featureGuard('module.policies')],
     loadComponent: () => import('./features/policies/policies.page').then(m => m.PoliciesPage) },
   ```
3. Add a nav item in `layout/shell/shell.ts`:
   ```ts
   { path: '/app/policies', label: 'nav.policies', icon: 'shield', feature: 'module.policies' }
   ```
4. Add translations for `nav.policies` and `policies.*` to **both** `he.json` and `en.json`.
5. If it's gated, add the flag (recipe 6.3) and an API endpoint (recipe 6.2).

The bottom nav shows every item, so keep **5 or fewer** top-level items, or move extras into a "More" menu.

### 6.2 Add an API endpoint for a page

1. Add the response type to `shared/src/index.ts` (e.g. `Paginated<Policy>` already works).
2. If the data comes from an external system, add a method to the provider interface in `provider.types.ts`, implement it in `mock/mock-providers.ts` (data from `mock-dataset.service.ts`), and add a stub in `live/live-providers.ts`.
3. Create the controller, for example `api/src/policies/policies.controller.ts`:
   ```ts
   @Controller('policies')
   @RequireFeature('module.policies')
   export class PoliciesController {
     constructor(@Inject(CRM_PROVIDER) private readonly crm: CrmProvider) {}
     @Get()
     list(@CurrentUser() user: TenantUser, @Query() q: PageQueryDto) { … user.tenantId … }
   }
   @Module({ controllers: [PoliciesController] })
   export class PoliciesModule {}
   ```
4. Register the module in `app.module.ts` `imports`.
5. If it's data you **store** (rather than proxy), write it under `tenants/{tenantId}/<collection>`. Add any composite indexes it needs to `firestore.indexes.json` and document it in `docs/firestore-model.md`.

### 6.3 Add a feature flag

1. `shared/src/index.ts` → add to the `FeatureKey` union, e.g. `| 'module.policies'`.
2. `api/src/feature-flags/flag-definitions.ts` → add a definition:
   ```ts
   { key: 'module.policies', description: 'Policies module', defaultEnabled: true, plans: ['pro', 'enterprise'] },
   ```
3. Translations: add `features.module.policies` in both language files (the Settings page lists every flag).
4. Use it with `@RequireFeature(...)` (API), plus `featureGuard` / `*ahFeature` / `NAV.feature` (web).
5. Optional: re-run `npm run seed` so `featureFlags/{key}` exists in Firestore for global editing.

TypeScript will flag every `Record<FeatureKey, …>` that needs updating.

### 6.4 Add a dashboard widget

Say you're adding `claims`:

1. **shared**
   - Add `'claims'` to `DashboardWidgetKey`.
   - Add `claims: SourceBlock<{…}>` to `DashboardSummary`.
2. **api**
   - In `dashboard.service.ts`, add a `block(enabled, 'claims', () => …)` to the `Promise.all` and return it.
   - In `tenants.controller.ts`, add `'claims'` to `WIDGETS`, the validation list.
   - In `flag-definitions.ts` → `DEFAULT_TENANT_SETTINGS.dashboardWidgets`, add it if it should be on by default.
3. **web**
   - Create `features/dashboard/widgets/claims.ts`, wrapping the content in `<ah-widget-card>` and using `blockState` / `dataOf`.
   - In `dashboard.page.ts`, add it to `imports`, `DEFAULT_WIDGETS` and `WIDGET_FEATURES`.
   - In `dashboard.page.html`, add `@case ('claims') { <ah-claims class="span-2" [block]="data()?.claims" [loading]="loading()" /> }`.
   - In `settings.page.ts`, add it to `WIDGETS` so tenants can toggle it.
   - Translations: `widgets.claims.*` and `widgetNames.claims`.

### 6.5 Add a new company (tenant) brand

1. `web/public/tenants/<slug>/theme.config.json`: copy an existing one and change the colors, font, radius, logo, tagline, languages and which auth methods to show. Add `logo.svg`.
2. In Firestore, create `tenants/<id>` with `slug`, `plan`, `branding` and `locales` (see `api/scripts/seed-dev.ts` for the shape), and optionally `config/settings` and `config/features`.
3. **Production:** serve the tenant at `<slug>.yourdomain.com`; `ThemeService` reads the subdomain. **Dev:** use `?tenant=<slug>`.
4. If the font isn't Rubik or Assistant, add it to the Google Fonts link in `web/src/index.html`.

### 6.6 Add a language (e.g. Arabic)

1. Add `'ar'` to `Locale` in `shared`.
2. Create `web/public/i18n/ar.json` with the same keys.
3. In `language.service.ts`:
   - Add `'ar'` to the `RTL` set.
   - Add a label to `LANGUAGE_LABELS`.
   - Add the Intl tag to `intlLocale`.
4. API: allow `'ar'` in the `@IsIn` lists (`users.controller.ts`, `dashboard.controller.ts`, `common/pagination.ts`). Add an `ar` branch to `TEXT` in `mock-dataset.service.ts`.
5. Add `'ar'` to `locales.supported` in each tenant's theme config and Firestore doc.

With 3+ languages, the language switch becomes a select automatically.

### 6.7 Add a form

Follow `features/auth/signup.page.ts` or `settings.page.ts`:
- Use `inject(NonNullableFormBuilder).group({...})`.
- Use the `.field`, `.input` and `.btn` classes.
- Show errors only when touched: `@if (form.controls.x.touched && form.controls.x.invalid)`.
- Track `busy` and `error` signals. Map auth errors with `authErrorKey(e)`.
- Mirror every validation rule in the API DTO. The server is the real gatekeeper.

### 6.8 Restrict something by role

- **API:** `@Roles('owner','admin')` on the handler.
- **Web, route level:** `canMatch: [roleGuard('owner','admin')]`.
- **Web, inside a page:** `computed(() => ['owner','admin'].includes(auth.role() ?? ''))`. See `SettingsPage.canEditOrg`, which also disables the form.

---

## 7. Testing

```bash
npm test                         # both
npm test -w api                  # vitest — guards, flag resolution, dashboard aggregation
npm test -w web -- --watch=false # vitest via `ng test` — LanguageService, ThemeService
```

**Web tests** live next to the code (`*.spec.ts`). With TestBed you can provide the translate service with a stub loader; see `core/i18n/language.service.spec.ts`:

```ts
TestBed.configureTestingModule({
  providers: [provideTranslateService({ loader: { provide: TranslateLoader, useClass: StubLoader } })],
});
```

For components that use `httpResource` or `HttpClient`, add `provideHttpClient()` and `provideHttpClientTesting()`, then use `HttpTestingController`.

**API tests** construct classes directly with fakes. **Vitest doesn't emit decorator metadata**, so Nest DI-based tests (`Test.createTestingModule`) won't resolve constructor injection. DI wiring is therefore only proven by running the app. See Gotcha #2.

**Manual end-to-end checklist** (until Playwright is added):
- Log in as `dana`, `acme` and `admin`.
- Switch he ↔ en.
- Resize to 375, 768 and 1440.
- Open `/app/messages` directly as `acme`: it should redirect to the dashboard.
- As `admin`, toggle a flag in Settings, then check that the dashboard and nav react.

---

## 8. Conventions checklist

Before opening a PR:
- [ ] Components are standalone and OnPush, use `inject()` and signal `input()`s, and use the `@if/@for/@switch` control flow.
- [ ] Reads use `httpResource`, and URLs are built from `environment.apiBaseUrl`.
- [ ] Types come from `@agency-hub/shared` (`import type`).
- [ ] No hard-coded colors; only LESS tokens.
- [ ] No `left`/`right` in CSS; everything still works in both `dir` values.
- [ ] Mobile layout checked at 375px, with no horizontal scroll.
- [ ] Every user-visible string goes through `translate`, with keys added to **both** `he.json` and `en.json`.
- [ ] Gated features use `@RequireFeature` on the API **and** a guard or directive on the web.
- [ ] Any new DTO field is added to the API DTO class (unknown fields are rejected).
- [ ] Guards inject everything **before** the first `await`.
- [ ] `npm test` and `npm run build` pass.

---

## 9. Gotchas we've already hit

1. **`inject()` after `await` in a guard crashes navigation** (NG0203). Resolve every dependency first, then await. See `core/auth/guards.ts`.
2. **NestJS DI and abstract base classes.** If a constructor lives in a base class, that base needs `@Injectable()`. Otherwise Nest injects `undefined` and you only find out at runtime. See `MockBase` in `mock-providers.ts`.
3. **`canMatch` runs before the parent `canActivate`.** A `canMatch` guard can't assume `authGuard` already ran. It must `await auth.ready()` itself.
4. **Claims change → refresh the token.** After the API sets custom claims (bootstrap), call `getIdToken(true)`. Otherwise the UI and API keep seeing the old token.
5. **The API caches tenant config for 30 seconds** (`TenantConfigService`). Edits made directly in Firestore show up after that. Edits made through the API invalidate the cache immediately.
6. **ESM in the API:** relative imports need `.js`.
7. **`shared` must stay types-only.** It has no build step, and the API (Node ESM) can't import TS runtime code from it.
8. **Router view transitions were removed.** They stall navigation when the document isn't rendering (rAF paused). Don't re-enable them without testing hidden-tab behaviour.
9. **Windows Application Control on this machine** blocks rolldown 1.2.12's native binary, so `vite` is pinned to 8.3.0 in the root `overrides` (and in `api` devDependencies). Remove both once the policy allows it.
10. **Projected content and `@if`:** `<span slot="badge">` inside an `@if` that has multiple root nodes won't project into the slot (NG8011). Split it into its own `@if`.
11. **Mock data depends on the language.** `lang=he` and `lang=en` produce different datasets. Real providers won't do this.

---

## 10. Roadmap

Ordered by what unblocks the most:

1. **Firestore rules tests** with `@firebase/rules-unit-testing`, plus a fuller seed.
2. **n8n ingestion:** `POST /api/ingest/:source` with an HMAC signature (`N8N_SECRET`), a timestamp window and idempotent upserts by `externalId` into `tenants/{tid}/messages|leads|…`. Also a WhatsApp Cloud API webhook (verify `X-Hub-Signature-256`) and exported workflows in `n8n/workflows/`. Once data is stored in Firestore, "live" providers can simply read it.
3. **Invitations UI:**
   - The API already accepts `inviteCode` in bootstrap.
   - Still to build: an endpoint that creates `tenants/{tid}/invitations` with a hashed code, and a Settings → Team page.
4. **Detail pages** (customer, message thread), plus assign/reply actions with audit.
5. **Playwright e2e** covering the manual checklist above.
6. **Production:**
   - Real Firebase project and App Check enforcement on the API.
   - Optional MFA.
   - Cloud Run (API) and Firebase Hosting (web) with `/api` rewrites.
   - CI that runs `npm test` and `npm run build`.
