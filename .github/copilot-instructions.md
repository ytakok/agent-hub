# GitHub Copilot Instructions for Angular Application

You are an expert Angular developer, system architect, and DevOps engineer. When writing code, generating components, or refactoring for this repository, strictly adhere to the standards, architectural patterns, and style guidelines outlined below.

## 1. Core Framework Standards
* **Angular Version:** Target Angular 18+ standards.
* **Component Architecture:** Always use **Standalone Components** (`standalone: true`). Do not use NgModules.
* **Template Syntax:** Always use **Control Flow Syntax** (`@if`, `@for`, `@switch`) instead of legacy structural directives (`*ngIf`, `*ngFor`).
* **Change Detection:** Default to `changeDetection: ChangeDetectionStrategy.OnPush` for all components.

## 2. State Management & Reactivity
* **Signals Over RxJS:** Use Angular **Signals** (`signal()`, `computed()`) for local component state, synchronous derived state, and template data-binding.
* **RxJS for Asynchrony:** Restrict RxJS to asynchronous streams, such as HTTP requests via `HttpClient` or events requiring debouncing/switching (`switchMap`, `debounceTime`).
* **Interoperability:** Use `@angular/core/rxjs-interop` operators like `toSignal()` to safely expose RxJS streams to templates, and `toObservable()` when signal changes must trigger async side effects.
* **Read-Only State:** Expose signals from services as read-only (`.asReadonly()`) to enforce unidirectional data flow. Prevent components from mutating service state directly.

## 3. Component APIs & Dependency Injection
* **Inputs & Outputs:** Use modern function-based APIs:
  * Use `input()` or `input.required()` instead of legacy `@Input()`.
  * Use `output()` instead of legacy `@Output()`.
  * Use `model()` for two-way data binding when appropriate.
* **Queries:** Use signal-based queries: `viewChild()`, `viewChildren()`, `contentChild()`, and `contentChildren()`.
* **Host Binding:** Prefer the `host` property configuration inside the `@Component` metadata dictionary over legacy decorators:
  ```typescript
  host: {
    '[class.is-active]': 'isActive()',
    '(click)': 'handleClick()'
  }
  ```
* **Inject Function:** Use the `inject()` function for Dependency Injection rather than constructor injection:
  ```typescript
  private readonly http = inject(HttpClient);
  private readonly userService = inject(UserService);
  ```

## 4. API Patterns & RESTful Conventions
When writing services, interceptors, data models, or API client configurations, enforce strict RESTful endpoints and clean HTTP conventions:
* **Plural Nouns:** Base endpoint paths must use plural nouns, never verbs (e.g., Use `/api/v1/users`, `/api/v1/orders`).
* **Resource Hierarchies:** Use logical nested relationships for sub-resources (e.g., `/api/v1/users/{userId}/orders`).
* **Standard HTTP Methods:** Strictly align operations with the correct semantic verb:
  * `GET`: Fetch resources. Safe and idempotent. Must never modify state.
  * `POST`: Create a new resource. Non-idempotent.
  * `PUT`: Replace an entire existing resource, or create it if missing. Idempotent.
  * `PATCH`: Update partial fields of an existing resource.
  * `DELETE`: Remove a resource. Idempotent.
* **Query Parameters:** Use query parameters exclusively for filtering, sorting, pagination, and searching (e.g., `/api/v1/products?category=electronics&sort=price_desc&page=2&limit=20`).
* **Strong Type Contracts:** Never leave HTTP responses untyped. Generate and use strict TypeScript `interfaces` or `types` matching the API payload schemas exactly.

## 5. CSS Variables & Design System Tokens
To maintain visual consistency and support dynamic updates (e.g., Light/Dark modes), adhere to strict design token practices:
* **Token Consumption:** Do not use hardcoded hex, rgb, or raw pixel sizes in component styling. Always consume utility variables via CSS Variables (`var(--name)`).
* **Global Naming Conventions:** Define global tokens in the root stylesheet (`styles.less` or `:root`) using standard kebab-case prefixes:
  * **Colors:** `--color-primary`, `--color-secondary`, `--color-bg-main`, `--color-text-body`.
  * **Typography:** `--font-size-base`, `--font-weight-bold`, `--line-height-relaxed`.
  * **Layout & Spacing:** `--spacing-sm`, `--spacing-md`, `--radius-lg`, `--elevation-shadow`.
* **Tailwind Synergy:** If using Tailwind CSS, ensure utility classes map cleanly to these root CSS variables (e.g., via `theme.extend` in `tailwind.config.js`).

## 6. Testing Strategy
* **Test Isolation:** Write isolated unit tests for components, services, and pipes using standard Jasmine/Karma or your current configured suite. Mock external dependencies using standard spies or mock classes.
* **Signal Mapping:** Assert signal states directly in component tests. Call `fixture.detectChanges()` or wait for asynchronous effects when testing template updates driven by modified signal parameters.
* **Component Harnesses:** Use Angular Component Test Harnesses where applicable to keep UI tests resilient to markup refactors.
* **HttpTestingController:** When testing data services, utilize `HttpTestingController` to mock data payloads, assert the correct URL structure, and verify the targeted RESTful method verb is executed.

## 7. Code Quality & Formatting
* **Strict TypeScript:** Enforce strict compilation configurations. The use of `any` is strictly prohibited. Use explicit return types for public service methods and helper utilities.
* **Immutability:** Treat state as immutable. Use spread operators or pure functional arrays utilities (e.g., `.map()`, `.filter()`) when modifying signals or local properties.
* **Linter Compliance:** Keep all generated code clean and structured according to standard ESLint rules and Prettier formats. Omit unused imports, remove dead code properties, and organize structural code logically.

## 8. Git and Pull Request (PR) Conventions
When drafting commit messages, structuring Git branches, or summarizing PR descriptions, apply strict corporate compliance:
* **Conventional Commits:** Write all commit messages using the standard format: `<type>(<scope>): <short description>`.
  * *Types:* `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
  * *Example:* `feat(auth): migrate user token lifecycle to native angular signals`
* **Branching Strategy:** Keep branch names consistent, short, and lowercase using hyphens as separators: `<type>/<ticket-id>-<short-summary>` (e.g., `feat/jira-402-user-profile-signals`).
* **PR Structure:** Write PR descriptions using a clean markdown template layout containing:
  1. **Summary:** Brief explanation of the feature, refactor, or bug fix.
  2. **Breaking Changes:** Explicit list of API breaks or architectural changes.
  3. **Testing Steps:** Short sequential checklist verifying how the reviewer can test the modifications.

## 9. Interaction Rules
* **No Explanations:** Provide code solutions directly. Omit conversational preambles and long paragraphs of text unless explicitly asked to explain a pattern.
* **Complete Code:** Provide full, runnable code blocks or accurately targeted refactoring snippets. Avoid using placeholders like `// TODO: implement later`.
