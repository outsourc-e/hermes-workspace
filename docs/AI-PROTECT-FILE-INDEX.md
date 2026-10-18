# AI Protect — Clickable File Index (M2 Max 64GB + Chrome 151 + Antigravity)

> All paths are absolute `file://` for Cmd+Click in VS Code / Antigravity / Cursor. Relative `./` also works.
> Generated 2026-09-11 — covers `plans/002`, `packages/ai-protect-*`, `apps/extension`, `tests/*`, `scripts/*`, configs.

## Root
- [hermes-workspace/](file:///Users/andreasnahrgang/hermes-workspace) — `hermes-workspace:1`

## Plan & Docs
- [plans/002-ai-protect-gemini-nano.md](file:///Users/andreasnahrgang/hermes-workspace/plans/002-ai-protect-gemini-nano.md) — `plans/002-ai-protect-gemini-nano.md:1`
- [docs/ai-protect/README.md](file:///Users/andreasnahrgang/hermes-workspace/docs/ai-protect/README.md) — `docs/ai-protect/README.md:1`
- [.antigravity/README.md](file:///Users/andreasnahrgang/hermes-workspace/.antigravity/README.md) — `.antigravity/README.md:1`
- [docs/ops/intel/knowledge-base/own-products.md](file:///Users/andreasnahrgang/hermes-workspace/docs/ops/intel/knowledge-base/own-products.md) — `own-products.md:67` AI-Protect baseline
- [docs/ops/intel/knowledge-base/taxonomy.yaml](file:///Users/andreasnahrgang/hermes-workspace/docs/ops/intel/knowledge-base/taxonomy.yaml) — `taxonomy.yaml:1`
- [docs/AI-PROTECT-FILE-INDEX.md](file:///Users/andreasnahrgang/hermes-workspace/docs/AI-PROTECT-FILE-INDEX.md) — this file

## Monorepo Config
- [pnpm-workspace.yaml](file:///Users/andreasnahrgang/hermes-workspace/pnpm-workspace.yaml) — `pnpm-workspace.yaml:1`
- [package.json](file:///Users/andreasnahrgang/hermes-workspace/package.json) — `package.json:9` scripts `test:live`, `nano:check` etc.
- [tsconfig.json](file:///Users/andreasnahrgang/hermes-workspace/tsconfig.json) — `tsconfig.json:30` aliases `@ai-protect/*`
- [vitest.config.ts](file:///Users/andreasnahrgang/hermes-workspace/vitest.config.ts) — `vitest.config.ts:1`
- [playwright.config.ts](file:///Users/andreasnahrgang/hermes-workspace/playwright.config.ts) — `playwright.config.ts:1` uses `Chrome 151` at `/Applications/Google Chrome.app`
- [.vscode/launch.json](file:///Users/andreasnahrgang/hermes-workspace/.vscode/launch.json) — `launch.json:1` Antigravity attach 9222
- [.vscode/tasks.json](file:///Users/andreasnahrgang/hermes-workspace/.vscode/tasks.json) — `tasks.json:1`
- [.vscode/settings.json](file:///Users/andreasnahrgang/hermes-workspace/.vscode/settings.json) — `settings.json:1`

## Packages — Shared
- [packages/ai-protect-shared/package.json](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-shared/package.json) — `shared/package.json:1`
- [packages/ai-protect-shared/src/index.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-shared/src/index.ts) — `shared/src/index.ts:1`
- [packages/ai-protect-shared/src/types.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-shared/src/types.ts) — `types.ts:1` `Hit`, `LexiconEntry`, `ManagedPolicy`
- [packages/ai-protect-shared/src/schemas.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-shared/src/schemas.ts) — `schemas.ts:1` `ManagedPolicySchema`, `NanoHitResponse`
- [packages/ai-protect-shared/src/constants.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-shared/src/constants.ts) — `constants.ts:1` `DEFAULT_ALLOWED_LLM_DOMAINS`, `LEAKAGE_RATES_LAYERX_2026`

## Packages — Core (PII + Company Secrets)
- [packages/ai-protect-core/package.json](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-core/package.json) — `core/package.json:1`
- [packages/ai-protect-core/src/index.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-core/src/index.ts) — `core/src/index.ts:1`
- [packages/ai-protect-core/src/pii-patterns.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-core/src/pii-patterns.ts) — `pii-patterns.ts:1` 18 Safe Harbor minus `PERSON_HEURISTIC`
- [packages/ai-protect-core/src/aho-corasick.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-core/src/aho-corasick.ts) — `aho-corasick.ts:1` `CompanySecretsTrie` longest-first
- [packages/ai-protect-core/src/substitute.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-core/src/substitute.ts) — `substitute.ts:84` `rehydrateFull` + `() => repl` $$ fix
- [packages/ai-protect-core/src/rehydrator.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-core/src/rehydrator.ts) — `rehydrator.ts:1` `StreamingRehydrator` buffered flush
- [packages/ai-protect-core/src/audit.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-core/src/audit.ts) — `audit.ts:1` `buildAuditReceipt` NIS2

## Packages — Nano (Gemini Nano)
- [packages/ai-protect-nano/package.json](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-nano/package.json) — `nano/package.json:1` `@types/dom-chromium-ai`
- [packages/ai-protect-nano/src/index.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-nano/src/index.ts) — `nano/src/index.ts:1`
- [packages/ai-protect-nano/src/adapter.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-nano/src/adapter.ts) — `adapter.ts:21` `checkAvailability` + `createSession` + `detectWithNano`
- [packages/ai-protect-nano/src/structured-schemas.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-nano/src/structured-schemas.ts) — `structured-schemas.ts:1` `HIT_SCHEMA`
- [packages/ai-protect-nano/src/types.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-nano/src/types.ts) — `types.ts:1`

## Packages — Policy
- [packages/ai-protect-policy/package.json](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-policy/package.json) — `policy/package.json:1`
- [packages/ai-protect-policy/src/index.ts](file:///Users/andreasnahrgang/hermes-workspace/packages/ai-protect-policy/src/index.ts) — `policy/src/index.ts:1` `hashPolicy`, `DEFAULT_POLICY` `CS_021 Titan→Atlas`

## Apps — Extension (MV3)
- [apps/extension/manifest.json](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/manifest.json) — `manifest.json:1` MV3 `host_permissions` chatgpt/claude/gemini/copilot/deepseek/perplexity
- [apps/extension/src/background/service-worker.ts](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/src/background/service-worker.ts) — `service-worker.ts:11` managed sync + audit flush + offscreen
- [apps/extension/src/content/content.ts](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/src/content/content.ts) — `content.ts:14` isolated, fetch intercept, `MutationObserver` rehydration
- [apps/extension/src/offscreen/offscreen.html](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/src/offscreen/offscreen.html) — `offscreen.html:1` `allow="language-model"` iframe
- [apps/extension/src/offscreen/offscreen.ts](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/src/offscreen/offscreen.ts) — `offscreen.ts:1` Nano host
- [apps/extension/src/devtools/devtools.html](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/src/devtools/devtools.html) — `devtools.html:1`
- [apps/extension/src/devtools/devtools.ts](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/src/devtools/devtools.ts) — `devtools.ts:1`
- [apps/extension/src/policy/managed_schema.json](file:///Users/andreasnahrgang/hermes-workspace/apps/extension/src/policy/managed_schema.json) — `managed_schema.json:1`

## Tests — Unit (jsdom, fast-check, 80% cov)
- [tests/unit/core-substitution.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/unit/core-substitution.test.ts) — `core-substitution.test.ts:1` longest-first, `[PERSON_1]`, `StreamingRehydrator`
- [tests/unit/nano-adapter.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/unit/nano-adapter.test.ts) — `nano-adapter.test.ts:1`
- [tests/unit/audit-receipt.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/unit/audit-receipt.test.ts) — `audit-receipt.test.ts:1`
- [tests/unit/perf-budget.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/unit/perf-budget.test.ts) — `perf-budget.test.ts:4` `p95<1.0ms` M2 Max
- [tests/unit/property-rehydration.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/unit/property-rehydration.test.ts) — `property-rehydration.test.ts:1` round-trip
- [tests/perf/bench.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/perf/bench.test.ts) — `bench.test.ts:1` 14.5TB replay

## Tests — Integration / Adversarial / Compliance / E2E / Live
- [tests/integration/fetch-intercept.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/integration/fetch-intercept.test.ts) — `fetch-intercept.test.ts:1`
- [tests/adversarial/prompt-injection.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/adversarial/prompt-injection.test.ts) — `prompt-injection.test.ts:1` injection-neutral
- [tests/compliance/eu-ai-act.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/compliance/eu-ai-act.test.ts) — `eu-ai-act.test.ts:1` LayerX thresholds
- [tests/e2e/extension-smoke.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/e2e/extension-smoke.test.ts) — `extension-smoke.test.ts:1` MV3 + todo playwright
- [tests/live/nano-live.test.ts](file:///Users/andreasnahrgang/hermes-workspace/tests/live/nano-live.test.ts) — `nano-live.test.ts:1` `skipIf(!LanguageModel)` live on M2 Max

## Fixtures
- [tests/fixtures/pii-fixtures.json](file:///Users/andreasnahrgang/hermes-workspace/tests/fixtures/pii-fixtures.json) — `pii-fixtures.json:1`
- [tests/fixtures/company-secrets-fixtures.json](file:///Users/andreasnahrgang/hermes-workspace/tests/fixtures/company-secrets-fixtures.json) — `company-secrets-fixtures.json:1`
- [tests/fixtures/leakage-rates.json](file:///Users/andreasnahrgang/hermes-workspace/tests/fixtures/leakage-rates.json) — `leakage-rates.json:1` LayerX 2026
- [tests/fixtures/nano-hit-fixtures.json](file:///Users/andreasnahrgang/hermes-workspace/tests/fixtures/nano-hit-fixtures.json) — `nano-hit-fixtures.json:1`

## Scripts (M2 Max helpers)
- [scripts/check-nano.mjs](file:///Users/andreasnahrgang/hermes-workspace/scripts/check-nano.mjs) — `check-nano.mjs:1` `pnpm nano:check`
- [scripts/check-nano-live.mjs](file:///Users/andreasnahrgang/hermes-workspace/scripts/check-nano-live.mjs) — `check-nano-live.mjs:1`
- [scripts/launch-chrome-nano.sh](file:///Users/andreasnahrgang/hermes-workspace/scripts/launch-chrome-nano.sh) — `launch-chrome-nano.sh:1` `pnpm nano:launch` + `9222` for Antigravity
- [scripts/sbom.mjs](file:///Users/andreasnahrgang/hermes-workspace/scripts/sbom.mjs) — `sbom.mjs:1` CycloneDX 1.5

## SBOMs & Coverage
- [sbom.cyclonedx.json](file:///Users/andreasnahrgang/hermes-workspace/sbom.cyclonedx.json) — `sbom.cyclonedx.json:1`
- [sbom-core.cyclonedx.json](file:///Users/andreasnahrgang/hermes-workspace/sbom-core.cyclonedx.json)
- [sbom-extension.cyclonedx.json](file:///Users/andreasnahrgang/hermes-workspace/sbom-extension.cyclonedx.json)
- [coverage/index.html](file:///Users/andreasnahrgang/hermes-workspace/coverage/index.html) — after `pnpm exec vitest run --coverage`

## How to use (Antigravity / VS Code / Cursor)
- `Cmd+Click` any `file://` above, or `Ctrl+Click` the `` `path:line` `` inline.
- `Cmd+Shift+P → Tasks: Run Task → nano:check / test:live (M2 Max) / chrome-devtools-mcp: start`
- `Run & Debug` → `Antigravity: Launch Chrome with Nano flags (M2 Max)` → `chrome://on-device-internals` → `available` → `await LanguageModel.availability(...)`
