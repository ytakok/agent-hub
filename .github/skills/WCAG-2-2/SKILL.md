---
name: wcag-2-2-accessibility
version: 1.0.0
description: "WCAG 2.2 Accessibility — combines automated scans and human-checklists, maps findings to WCAG 2.2, and suggests safe fixes."
trigger: on-demand
---

Purpose

- Automate scanning for WCAG 2.2 A/AA/AAA issues, group by severity, and produce suggested patches for safe fixes.
- Combine `axe-core`/`pa11y` scans with a manual checklist for contextual rules.

Inputs

- `workspaceScope`: glob or folder (default: src/\*\*)
- `wcagLevel`: one of A | AA | AAA (default: AA)
- `includePatterns`, `excludePatterns`
- `autoFix`: boolean (default: false)
- `confirmBeforeApply`: boolean (default: true)
- `tools`: list (defaults: [axe-core, pa11y])
- `languages`: optional list for i18n checks

Outputs

- Structured JSON report mapping issues to WCAG 2.2 SC ids (e.g., 1.1.1, 2.4.7).
- Human-friendly Markdown summary and suggested diffs for supported autofixes.
- `accessibility-report.json` for CI.

Checks (examples mapped to WCAG 2.2)

- Images (1.1.1): missing/empty `alt`. AutoFix: add empty alt for decorative images; suggest text for content images.
- Contrast (1.4.3 / 1.4.11): find failing color pairs; suggest token replacements. AutoFix: optionally replace tokens in stylesheets.
- Semantic landmarks (1.3.1 / 2.4.1): ensure single `main`, use `section` with `aria-labelledby` for pages. AutoFix: replace `main` in page components with `section aria-labelledby`.
- ARIA correctness: detect `aria-label` misuse on generic elements; suggest `role` or `aria-labelledby`. AutoFix: small-safe transformations only.
- Form labels (3.3.2): inputs without labels. AutoFix: add `<label for>` or `aria-labelledby` where unambiguous.
- Keyboard & focus (2.1.x / 2.4.7): keyboard reachability and visible focus. Manual verification (no automatic fixes).

Autofix Policy

- Run only when `autoFix=true`. If `confirmBeforeApply=true`, present proposed patches for confirmation.
- Supported safe fixes: add alt attributes, replace semantic tags, update CSS color tokens, add straightforward labels, remove trivial console logs.
- Unsafe/ambiguous fixes (keyboard behavior, complex ARIA semantics, dynamic interactions) are flagged for manual review.

Workflow

1. Run automated scan with configured tools across `workspaceScope`.
2. Run stylesheet contrast/token analysis.
3. Map findings to WCAG 2.2 SC, group by severity.
4. Generate suggested diffs for safe fixes and present manual checklist for contextual issues.
5. Optionally output `accessibility-report.json` for CI and a Markdown summary for PRs.

Example prompts

- "Run WCAG 2.2 Accessibility Tester on `src/app/**` at level `AA` and generate suggested patches (do not apply)."
- "Scan public/ for WCAG A issues and create a JSON CI report."

Ambiguities / Decision points (please confirm)

- Default WCAG level to enforce (A / AA / AAA)?
- Allow `autoFix` in CI or restrict to manual runs?
- Preferred scanner(s): `axe-core`, `pa11y`, or both?
- Default save location for reports/patches?

Notes

- Recommended integrations: `axe-core`, `pa11y`, `color-contrast-checker`. For Angular, run scans against a dev server (`npm start`) or static built output.
