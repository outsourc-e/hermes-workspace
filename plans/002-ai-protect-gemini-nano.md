# PLAN 002 — AI Protect on Gemini Nano: PII + Company Secrets — Refactor & Build Plan
## Complete Portable Spec for Cross-IDE Development

> Generated 2026-09-11. Combines analyses of `developer.chrome.com/docs/devtools` (+ subsites), `developer.chrome.com/docs/ai/prompt-api` + Built-in AI, `ai-protect.store` (JS-rendered — title only), `docs/ops/intel/knowledge-base/own-products.md:67` + `taxonomy.yaml:1`, PDF `Executive Briefing | 2026 — Die Ära der Schatten-KI` (11 pages, Gemini Notebook), and the `Company Secrets` requirement (phrase `similar-word → reversible`).
> Target repo: `hermes-workspace` (`package.json:2 v2.0.0`, `src/lib`, `vite.config.ts:1`, `vitest 3.0.5`, `playwright 1.58.2`).
> Status: Build mode — this doc is the source of truth; code under `packages/ai-protect-*` and `apps/extension` implements it.

---

## Table of Contents
1. [Chrome DevTools Site Analysis](#1-chrome-devtools-site-analysis)
2. [Built-in AI + Prompt API Analysis](#2-built-in-ai--prompt-api-analysis)
3. [AI Protect Product (own-products.md + PDF)](#3-ai-protect-product)
4. [Company Secrets — New Category](#4-company-secrets--new-category)
5. [Chrome Engine Integration — PDF 5-Step → 3-Step Native](#5-chrome-engine-integration)
6. [Refactor Plan — Monorepo](#6-refactor-plan)
7. [Sophisticated Testing Suite](#7-sophisticated-testing-suite)
8. [Risks & STOP Conditions](#8-risks--stop-conditions)
9. [Immediate Confirms](#9-immediate-confirms)
10. [How to Use (cross-IDE)](#10-how-to-use)

---

## 1. Chrome DevTools Site Analysis

**Top-level IA verified via `webfetch`:**
- Landing `docs/devtools` (lp-hero) → Get started / AI assistance / Panels / Settings / For agents
- `Get started`: `overview`, `open`, `whats-new`, `customize`, `tips`, `command-menu`, `shortcuts`, `device-mode`, `search`, Remote Debugging (Android, port-forward, WebViews)
- `AI assistance` cluster: `overview` (Gemini integrated), `get-started` (requirements/opt-in), `chat` (contextual Element/Network/Sources/Performance), `code-generation` (Console+Sources), `data-usage-and-enterprise-controls`; plus `settings/ai-innovations` toggle (Console insights + AI assistance, enterprise policyable)
- `Panels` (16+): Elements (DOM+CSS), Console (Utilities/API), Sources (breakpoints/workspaces/overrides), Network `network/overview + reference`, Performance `performance/overview + annotations/extensibility/selector-stats/nodejs`, Lighthouse, Memory, Application (Local/Session/Extension/IndexedDB/WebSQL, Cookies, Cache, BFCache, speculation rules, WebMCP), Recorder, Rendering, Security
- `All`: Autofill, Animations, Application, Changes, Coverage, CSS Overview, Developer Resources, **Issues** `docs/devtools/issues` (grouped Page Errors/Breaking Changes/Improvements, AFFECTED RESOURCES deep-link), Layers, Media, Memory Inspector, Network conditions, Request conditions, Performance monitor, Protocol monitor, Quick source, Sensors, WebAudio, WebAuthn, What's new
- `DevTools for Agents` `docs/devtools/agents/get-started`: MCP Server `chrome-devtools-mcp`, CLI, Agentic Skills (a11y/perf) for Claude/Cursor/Copilot/Antigravity
- `Settings/Accessibility`: preferences|workspace|ai-innovations|experiments|ignore-list|devices|throttling|locations|shortcuts

**Design takeaway:** DevTools is already AI-native (Gemini cloud via AI Assistance) but separate from Built-in AI (local Gemini Nano) — two trust boundaries. See §2.

---

## 2. Built-in AI + Prompt API Analysis

**Models/distribution:**
- Expert: Translator, Language Detector; Foundation: Gemini Nano. Since Chrome 149: `en, ja, es, de, fr` (`docs/ai/get-started`). Prompt/Summarizer/Writer/Rewriter/Proofreader require `Windows 10/11 | macOS 13+ | Linux | ChromeOS Chromebook Plus`, `22GB free`, `>4GB VRAM OR 16GB RAM+4 cores`, unmetered only for download. Not mobile. Flags `chrome://flags/#optimization-guide-on-device-model` + `#prompt-api-for-gemini-nano`, internals `chrome://on-device-internals`.

**API status:**
- Stable Chrome 138: Translator, Language Detector, Summarizer, Prompt API (Extensions since 138, Web since 148) — chromestatus 5134603979063296
- Trial: Writer, Rewriter, Proofreader
- Sampling: web default NO temperature/topK; Origin Trial enum `samplingMode: most-predictable..most-creative`; Extensions retain `LanguageModel.params()` + `temperature/topK`

**Prompt API ergonomics (`docs/ai/prompt-api`):**
```js
await LanguageModel.availability({expectedInputs:[{type:"text",languages:["de","en"]},{type:"image"}], expectedOutputs:[{type:"text",languages:["de"]}]}) // unavailable|downloadable|downloading|available
const s = await LanguageModel.create({initialPrompts:[{role:'system',content:'...'}], expectedInputs/expectedOutputs, samplingMode:'most-predictable', monitor(m){m.addEventListener('downloadprogress',...)}})
await s.prompt("..") // or promptStreaming()->ReadableStream
await s.append([...]); s.clone(); s.destroy()
s.contextUsage/s.contextWindow + 'contextoverflow' → session.clone() // session-compacting via Summarizer
responseConstraint: JSON Schema // structured-output
// multimodal: AudioBuffer|Blob, HTMLImageElement|Canvas|VideoFrame|ImageData
// permission: <iframe allow="language-model">, no Web Worker
```
Task APIs also relevant: Summarizer (`scale-summarization`), Translator/Language Detector (DACH), Writer/Rewriter/Proofreader.

**Extensions AI:** `docs/extensions/ai` endorses hybrid (on-device + Firebase fallback), model lifecycle, privacy.

---

## 3. AI Protect Product

**Positioning evolution:** `Sovereign Browser AI → Liability Shield → Compliance Engine (risk-tier auto-tag) → Closing Browser Blind Spot → Productivity Governance Layer → Operational Telemetry/Active Defense` — vs LayerX `"AI Extension Security Platform"`.

**Assured features (vault + PDF p8-11):**
- shadow_ai_tool_discovery: full (DACH/KRITIS, EVN golden sample 10x), 1280+ tools detected, 269/1000 MA
- browser_extension_coverage: full (agentenlose MV3)
- operational_telemetry: full (14.5 TB/mo data flow, 95% mitigation, 99.9% uptime, 8.5/10 vuln idx)
- eu_ai_act_mapping: full, audit_trail_receipts: full, policy_engine: full
- GDPR/NIS2/DSGVO mapped, BSI ADVISORI, 24h NIS2 Meldpflicht, +$670k Shadow-AI uplift +16% (IBM 2025)
- Pipeline p9: `Eingabe & Blockade → Hybrid-Verschlüsselung RSA-2048+AES-256-GCM → On-Prem/Trusted Compute Flair-NER Max Müller→[PERSON_1] → Clean Prompt → Re-Identifikation Inline [PERSON_1]→Max Müller`
- Hardening p10: Zwangsinstallation GPO/Intune (MV3+Edge), Anti-Tampering DevTools-Sperre, Audit-Transport revisionssicher (NIS2), CycloneDX 1.5 SBOM x2
- Four pillars p11: Erkennen (browser Einsicht), Schützen (Last Mile, no external LLM), Ermöglichen (ChatGPT/Gemini/Copilot via Entra ID)

**Sibling PrivacyScrubber (`own-products.md:10`):** 18 Safe Harbor+25 profiles, <2ms regex, WASM NER ~35MB, `context_preserving_tokenization` custom `[PATIENT_ID]`, reversible, file sanitization (tesseract), `client_side_zero_server: full` airplane-mode, libsodium XChaCha20-Poly1305, Ed25519.

**Cost / leakage numbers p5-6:** >6% KI-Kommunikation sensibel (1/12 PII), LayerX 2026: DeepSeek 12.63% > ChatGPT 8.38% (55% convos) ~ Copilot 8.31% > Claude 6.43% > Gemini Ent. 6.14% > Gemini 4.5% > M365 3.65%; 63% don't know LLM location; Samsung ChatGPT block precedent.

**Reconciliation:** Deck's `eigenen Servern Flair-NER` vs vault's `client_side_zero_server: full` → treat deck as current 0.3 enterprise (on-prem relay) and replace hop with true on-device Nano in refactor — strictly stronger.

---

## 4. Company Secrets — New Category

**Requirement:** Predefined lexicon phrase `secret → similar decoy phrase` (not `[SECRET]` mask), bidirectional map, LLM sees decoy, user sees original rehydrated.

**Taxonomy delta (`taxonomy.yaml`):**
```yaml
company_secrets: "Customer-defined lexicon (codename/product/supplier/strategy phrase) → similar-phrase decoy, reversible on response"
```

**Lexicon example:**
```json
{"company_secrets":[
  {"id":"CS_021","secret":"Project Titan","decoy":"Project Atlas","type":"codename"},
  {"id":"CS_042","secret":"Lithium-Preis 47€/kg","decoy":"Komponentenpreis 48€/kg","type":"pricing_phrase"}
]}
```
Stored `chrome.storage.managed` (GPO), longest-first Aho-Corasick, `Intl.Segmenter` boundaries, streaming rehydrator.

**Detection hybrid:**
1. Sync exact Aho-Corasick (<2ms)
2. Async Prompt fuzzy (`prompt({responseConstraint: HitSchema})` where `HitSchema={lexId,surface,start,end}`) for `TITAN-Project`/`Projekt Titan`

Decoy generation is offline curated (static, KRITIS-auditable); Prompt optionally proposes `slightly-creative` candidates once, human approves, cached.

**Rehydration:** streaming word-boundary buffer, position-map only (avoids natural collision), `Uint8Array.fill(0)` wipe + `session.destroy()`.

---

## 5. Chrome Engine Integration

| PDF Step | With Gemini Nano | DevTools Hook |
|---|---|---|
| 1 Eingabe & Blockade | content-script `beforeinput` + `AbortController` pause | Network `blocked:pending-ai-scan` |
| 2-3 Flair on-prem | **Replace** with `LanguageModel` structured-output session (`most-predictable`, `de/en`) + multimodal | `LanguageModel.availability()`, Issues group |
| 4 Clean Prompt | decoy-substituted egress | Issues `Company Secret substituted (CS_021)` + Network `ai-protect: substituted=3` |
| 5 Re-Identifikation | streaming decoy→secret swap | MCP `ai-protect.rehydrate` |

Manage `chrome.storage.managed` + `ExtensionSettings` force-install, `allow="language-model"` policy, Entra via `chrome.identity`, SBOM pair, anti-tamper F12 block.

**Instrumentation pseudocode:**
```
onInput(text):
  exact = ac.search(text) // sync
  if !exact && nanoAvailable:
    hits = await promptSession.prompt(text + lexiconIds, {responseConstraint: HitSchema})
  merged = deduplicateLongest(exact + hits)
  for hit in sortByLengthDesc(merged):
    text = replaceBoundary(text, hit.surface→ lexicon[hit.lexId].decoy)
    map[lexicon[hit.lexId].decoy] = lexicon[hit.lexId].secret
  return text
```

---

## 6. Refactor Plan

**Target layout:**
```
apps/workspace (moved src) | apps/extension (MV3) | apps/dashboard (CISO)
packages/ai-protect-core | packages/ai-protect-nano | packages/ai-protect-policy | packages/ai-protect-shared
tests/unit|integration|e2e|perf|adversarial|compliance
```

**Phase 0 Baseline (3d):** pnpm-workspace/turbo, docs assumptions lock.

**Phase 1 Core (7d):** zod schemas Lexicon/Hit/SessionMap, 18 PII regex <2ms, Aho-Corasick secrets, `substituteExact`/`rehydrate` + `Segmenter`, libsodium/Ed25519.

**Phase 2 Nano Adapter (7d):** `createNanoSession` wrapping `availability`/`monitor`/`UserActivation`, `responseConstraint`, `measureContextUsage`/`contextoverflow→clone`, multimodal, `unavailable` fallback.

**Phase 3 Extension (10d):** MV3 manifest, background SW (managed lexicon + Entra + audit queue + anti-tamper rule), content isolated intercept, offscreen Nano doc, DevTools Issues/Network/WebMCP, `🔒` badge.

**Phase 4 Policy (4d):** GPO/Intune JSON schema, CycloneDX 1.5 x2, Entra role slices.

**Phase 5 (optional) Native fork:** `//chrome/browser/ai_protect/` via optimization_guide component updater.

Brigade per `plans/001-*` pattern: conventional commits `feat(ai-protect): ...`, STOP on `vite.config.ts` proxy drift or `pnpm-lock.yaml` divergence.

---

## 7. Sophisticated Testing Suite

Use `vitest 3.0.5 + jsdom 27 + msw + fast-check + playwright 1.58 + playwright-extra-stealth + chrome-launcher + chrome-devtools-mcp + tinybench + stryker`.

| Layer | Suite | Framework | Assertion |
|---|---|---|---|
| Unit | substitution longest-first | vitest table | `Project Titan Phase 2` beats `Project Titan` |
| Unit | rehydration idempotence | fast-check | `rehydrate(substitute(text))==text` |
| Unit | nano lifecycle | vitest mock LM | `downloadable→downloading→available` |
| Integration | content↔offscreen block | vitest+jsdom+msw | `api.openai.com` body decoy-only |
| Integration | GPO hot-update | playwright --load-extension | trie updates, management.setEnabled blocked |
| E2E | shadow discovery 1280+ | playwright-extra stealth + MCP | header parse |
| E2E | Clean Prompt | playwright trace | `ai-protect: substituted` |
| E2E | anti-tamper F12 | playwright | audit queue++ |
| Adversarial | prompt injection 1k | eval harness OWASP | `IGNORE PREVIOUS` not executed |
| Security | supply-chain SBOM | cyclonedx diff | no high CVSS |
| Perf | <2ms p95 exact | tinybench 10k | `expect(p95).toBeLessThan(2)` |
| Perf | heap wipe | CDP HeapProfiler | secret absent |
| Perf | context window | fast-check 100-turn | compact triggered |
| Multimodal | File OCR PDF | canvas upload | ImageData → text |
| Compliance | EU AI Act/NIS2 receipt | zod EU taxonomy | signed receipt riskTier |
| Visual | dashboard matrix | toHaveScreenshot | threshold 0.2 |
| Mutation | ≥80% | stryker | |
| Coverage | --covFailUnder=85 | vitest coverage | |

CI: `pnpm test` (unit cov), `test:integration` (headless chrome with PromptAPI flag), nightly `adversarial+perf` → Slack. Fixtures: `pii-fixtures.json` 500, `company-secrets-fixtures.json` 200, `leakage-rates.json`, `shadow-ai-fixtures.log`.

**Done criteria:** `tsc --noEmit 0`, `vitest cov ≥85` (≥120 tests), `mutation ≥0.80`, `p95 <2ms`, Clean Prompt proof, SBOM x2 + `web-ext lint 0`, `🔒` + Issues group.

---

## 8. Risks & STOP Conditions
- LM `unavailable` on 45% Bund fleet → keep regex fallback
- Prompt only 5 langs — extend via Translator if `pl` needed
- managed storage not deliverable via GPO in PoC → pause
- `vite.config.ts` proxy drift → STOP

## 9. Immediate Confirms
1. Keep `apps/workspace` chat or sunset to dashboard?
2. Provide 5 canonical secret→decoy pairs
3. Gate: degrade vs mandate 22GB Chromebook Plus?
4. Distribution: public vs private Enterprise collection?
5. Timeline: 4w MV3 vs 7w native fork?

## 10. How to Use

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm test                # unit + cov
pnpm --filter @ai-protect/core test
pnpm --filter extension build && npx web-ext lint
```

In VS Code / Cursor / WebStorm open `packages/ai-protect-*` as separate workspaces — `@ai-protect/*` via `tsconfig.json` `@` alias. See section 7 for running e2e/adversarial/perf suites. After Q1-5 answers, branch `feature/ai-protect-nano` with per-phase commits.

---

*Evidence: `developer.chrome.com/docs/devtools` + `.../ai/prompt-api` + `.../ai/get-started` + `.../agents/get-started` + `.../extensions/ai` browsed 2026-09-11; `own-products.md:67` + `taxonomy.yaml:1`; PDF `Executive Briefing | 2026` decoded; no `attached pdf` found in repo before — now reconciled.*
