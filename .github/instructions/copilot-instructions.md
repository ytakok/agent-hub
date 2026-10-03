# GitHub Copilot Instructions

## Project Overview

This repository contains a multi-project workspace:

- `sample-app` — Angular 18+ frontend app using standalone components, signals, LESS styling, `TranslatePipe`, and Firebase environment config.
- `nest-firebase-api` — NestJS backend API with Firebase Admin integration, DTO-based endpoints, and `.env`-driven secrets.

> The root `package.json` is a placeholder. Use the subproject package scripts in `sample-app/` and `nest-firebase-api/`.

## Project Commands

### Frontend (`sample-app`)

- `cd sample-app && npm install`
- `cd sample-app && npm start`
- `cd sample-app && npm run build`
- `cd sample-app && npm test`

### Backend (`nest-firebase-api`)

- `cd nest-firebase-api && npm install`
- `cd nest-firebase-api && npm run start:dev`
- `cd nest-firebase-api && npm run build`
- `cd nest-firebase-api && npm run test`

### Firebase and environment

- Angular frontend config lives in `sample-app/src/environments/environment.ts` and uses `NG_APP_*` env vars.
- Backend secrets live in `nest-firebase-api/.env` and gitignored `nest-firebase-api/src/config/firebase-key.json`.
- Do not add service account credentials or private keys to version control.

## AI Contracts and Agent Registry

### Master registry

| File                        | Purpose                                               |
| --------------------------- | ----------------------------------------------------- |
| `.vscode/skills/index.json` | AI agent registry, workflows, and contract references |

### Domain contracts (`.vscode/skills/domain/`)

- `project.json` — project architecture, patterns, and conventions
- `accessibility.json` — WCAG 2.2 AA compliance rules
- `html5.json` — semantic HTML and valid nesting
- `i18n.json` — translation and RTL guidelines
- `ui.json` — UI component and layout patterns
- `data.json` — data layer, service, and state-management patterns
- `templates.json` — reusable component/service templates

### Integration contracts (`.vscode/skills/integrations/`)

- `firebase.json` — Firebase integration patterns for Angular and Nest

### Agent definitions (`.vscode/skills/agents/`)

- `code-review.agent.md` — automated code review with project contract checks
- `ui-generation.agent.md` — Figma-to-Angular component generation

## Guidelines for generated code

### Angular frontend

- Prefer `standalone: true` components.
- Use `signal()` / computed signals instead of unnecessary RxJS when state is local.
- Use `inject()` when possible for tree-shakable services.
- Avoid `any`; use explicit typed DTOs and interfaces.
- Use `TranslatePipe` for visible text and never hardcode strings.
- Keep templates semantic, accessible, and keyboard friendly.
- Follow BEM-style class naming in `.less` files.
- Use logical CSS properties for RTL support.

### NestJS backend

- Use DTOs and validation pipes for request payloads.
- Prefer `async/await` with `try/catch` for all Firebase and network calls.
- Do not expose service account fields or Firebase keys in generated code.
- Keep controllers thin; delegate business logic to services.
- Use `nestjs` built-in providers and dependency injection.

### Accessibility and i18n

- Use semantic tags (`<main>`, `<section>`, `<article>`, `<nav>`).
- Add ARIA roles/labels to interactive elements.
- Ensure keyboard navigation works for forms, buttons, and dialogs.
- Validate all visible text through translation keys.
- Support RTL layout for Hebrew locale.

## AI workflows and usage

- Use `.vscode/skills/agents/code-review.agent.md` for reviews.
- Use `.vscode/skills/agents/ui-generation.agent.md` for UI/component generation.
- Use `.vscode/skills/index.json` to discover workflows like `new-feature`, `figma-to-code`, and `code-review`.
- When editing code, prefer the contracts in `.vscode/skills/domain/` and `.vscode/skills/integrations/` over generic Angular/Nest advice.

## Do NOT

- Hardcode Firebase credentials or service account secrets.
- Use inline styles in Angular templates.
- Use `any` as a shortcut.
- Skip translation keys for user-facing text.
- Generate backend routes without matching NestDTO/validation patterns.
- Assume root workspace scripts are valid; use the subproject scripts above.
