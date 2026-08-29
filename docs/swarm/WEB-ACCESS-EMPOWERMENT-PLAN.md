# Hermes Swarm Web & Browser Access Empowerment Plan (2026)

**Status**: Draft v1 • Owner: Hady + Hermes Swarm
**Date**: 2026-05
**Goal**: Dramatically improve "web" + "browser" capabilities for the swarm (especially Researcher/Idea Engine and execution workers) using modern local-first, skill-native, high-reliability tools. Reduce fragility, token cost, MCP dependence, and "cannot access this site" failures while preserving the zero-fork Hermes + standalone philosophy.

## Current State (from workspace discovery)

### Swarm Declaration (swarm.yaml + AGENTS.md)
- Most workers declare **web** and/or **browser** tools:
  - Researcher (Idea Engine core): gbrain + web + browser + vision + autoresearch + browser-harness-power-use + arxiv/youtube/polymarket
  - QA: heavy browser + browser-harness-power-use + vision
  - Builder, Maintainer, Reviewer, Strategist, Orchestrator, Inbox-Triage: web + browser in varying degrees
- Key skills: `browser-harness-power-use`, `defuddle`, `autoresearch`, `researcher-quick`/`researcher-autoresearch`
- Existing stack: Playwright + playwright-extra + puppeteer-extra-plugin-stealth (in package.json, vite config, scripts, tests). "browser-harness" exists but is the current bottleneck.
- MCP backbone for most workers: gbrain (internal). External web access is secondary/fragile.
- Hermes core (~/.hermes/hermes-agent/) has its own large tools/ + skills/ (600+ skills) and profiles. Workspace is the UI + swarm orchestration layer on top of vanilla Nous Hermes Agent.

### Known Pain Points (inferred + doctrine alignment)
- Anti-bot / Cloudflare / modern JS sites still cause frequent failures for Researcher autoresearch loops and QA smoke tests.
- High token cost when feeding raw or poorly cleaned pages into agents.
- Auth / persistent logged-in sessions are brittle for complex research or execution tasks.
- Over-reliance on MCP surface for "web" (violates .claude/CLAUDE.md standalone doctrine: "Do not rely on MCPs as the main source of empowerment").
- Researcher (Idea Engine) needs broader, cheaper, higher-success external research (X signals, competitive sites, design refs, market data) without per-site APIs.
- QA/Builder need reliable interaction (forms, logins, multi-step flows) on arbitrary real-world sites.
- Playwright harness exists but lacks the production anti-bot, memory, extraction, and agent-ergonomic features of 2025-2026 tools.

**Philosophy reminder** (from ~/.claude/CLAUDE.md and project rules): Standalone / local-first / skills > new heavy MCP orchestration. Use browser/CLI evidence. Prefer project files + deterministic tools.

## Target Tools (Prioritized for Hermes + Idea Engine)

### 1. Vercel Labs agent-browser (Highest priority quick win — CLI / Skill layer)
- **Why it wins for Hermes**: Purpose-built as an *AI agent skill*. Rust-native fast CLI + daemon, accessibility-tree snapshots + compact `@eN` refs (massive token savings vs raw Playwright or heavy MCP), excellent auth/session/profile management, security features (allowlists, policies, encryption), specialized skills (electron, slack, dogfood, sandbox). Already ships `SKILL.md` pattern that matches our ecosystem.
- **Fit**:
  - Researcher: cheap, reliable page snapshots + extraction during quick/autoresearch.
  - QA: superior smoke + dogfood harness (already has "dogfood" skill in agent-browser).
  - Builder/Maintainer: form filling, GitHub flows, real app automation with low context.
- **Integration**: Install globally or per-profile, expose as `browser` tool upgrade or new `agent-browser` tool. Workers call via terminal wrapper or direct skill. Persistent profiles map beautifully to Hermes profile system.
- **Local-first**: Fully local Chromium via CDP. Cloud providers only as optional backends.
- **Evidence**: Heavily praised on X for Claude Code / Cursor agent workflows; explicit precedent with Nous Hermes Agent using it as browser backend.

### 2. Crawl4AI (unclecode/crawl4ai) — Research / Bulk layer for Idea Engine
- **Why it wins**: Blazing fast LLM-friendly crawler/scraper with memory-saving browser recycling, consent popup removal, shadow DOM flattening, deep crawl controls/cancellation, strong Markdown/structured extraction, Docker + MCP + Python SDK. Perfect "wide net" for Researcher when bounded by robots/site terms and explicit source budgets.
- **Fit**:
  - Researcher: primary external research engine for autoresearch loops, market mapping, competitive intel, X-adjacent signals, bulk site analysis. Far cheaper and more reliable than per-page browser calls.
  - Strategist / Inbox-Triage: fast synthesis fuel.
- **Integration**: Run as always-on local Docker service (port 11235). Expose via new `crawl4ai` tool or skill in researcher profile. Python SDK or HTTP calls from Hermes tools layer. Combine with defuddle for post-processing.
- **Local-first**: Full self-host. Stealth modes + proxies you control.
- **Evidence**: Dominates "scrape any site without getting blocked" threads alongside the browser agents.

### 3. browser-use (browser-use/browser-use) — Full agentic execution (when needed)
- **Why**: 95k+ stars, mature self-healing browser agent for complex multi-step tasks on arbitrary sites (logins, forms, real apps). CLI + skills for Claude ecosystem + cloud stealth fallback. Exactly "access to almost every website with no APIs required".
- **Fit**: Upgrade path for `browser-harness-power-use` when QA/Builder/Researcher need true agency (not just snapshot + scrape). Persistent real profiles.
- **Integration**: Secondary/optional. Install as Python lib or CLI; wrap as advanced browser tool. Use only when agent-browser or Crawl4AI are insufficient.

### 4. Supporting / Specialized
- **ScrapeGraphAI**: Natural-language extraction pipelines with excellent Ollama support — embed in Researcher skills for "describe what you want from this site" flows.
- **Skyvern** (optional): Vision + LLM for the hardest visual/RPA cases.
- **BrowserOS** (watch): Full agentic Chromium fork with native MCP + 53 tools + local Ollama. High ambition but heavier lift (evaluate later for "live inside the browser" mode).
- **web2cli** or similar lightweight: For ultra-cheap common-site CLI adapters.

**Do not adopt blindly**: Firecrawl is excellent but more hosted-primary (self-host possible, but lower priority than pure local options above).

## Proposed Architecture (Local-First, Skill-Native, Low MCP Surface)

1. **Fast Research Layer (Idea Engine fuel)**: Crawl4AI Docker service (local) + ScrapeGraphAI pipelines. Researcher calls this first for breadth.
2. **Efficient Interaction Layer (default browser tool)**: Vercel agent-browser (CLI skill). Low-token snapshots + actions. Primary replacement/upgrade for most "browser" calls.
3. **Deep Agentic Layer**: browser-use (or upgraded harness) only when full self-directed execution is required.
4. **Extraction Post-Processing**: Keep/enhance defuddle + new Crawl4AI + agent-browser outputs.
5. **Auth & Escalation**: Shared persistent Chrome profiles are local-only. Anti-bot/CAPTCHA encounters are classified as blockers by default. Proxy, stealth, hosted browser, or cloud fallback is absent from default config and requires separate Orchestrator greenlight, legal/terms posture, approved target scope, expiry, and redacted evidence.
6. **Observability**: Tie into existing ops-watch, gbrain memory, swarm notifications, and new agent-browser dashboard (port 4848).
7. **Swarm Governance**: Update `swarm.yaml` per-worker to declare the new capabilities explicitly (e.g. `crawl4ai-research`, `agent-browser`, `deep-browser-execution`). Keep GBrain as primary internal brain; these are external capability extensions.

This respects the standalone doctrine: new capabilities are CLI/Docker/services + skills that workers invoke directly, not new mandatory MCP servers.

## Phased Rollout Plan

### Phase 0 — Foundations & Quick Wins (1-2 weeks)
- Install & test Vercel `agent-browser` globally + per-profile.
- Create initial Hermes skill wrapper(s): `agent-browser-core`, `researcher-agent-browser`, `qa-dogfood-browser`.
- Run Crawl4AI Docker locally; basic smoke test from researcher profile.
- Document persistent profile strategy (Chrome profile reuse + state export).
- Update `swarm.yaml` (researcher, qa, builder) to list new tools/skills.
- Add evaluation cases (hard anti-bot sites, login flows, X research, autoresearch loops) to `evals/researcher-routing/` or new `evals/web-access/`.
- Success metric: 80%+ success on previously failing Researcher quick research tasks with <50% previous token cost.

### Phase 1 — Researcher (Idea Engine) Superpower (3-6 weeks)
- Full Crawl4AI integration as primary external research backend (HTTP SDK or MCP-optional wrapper).
- Enhance `researcher-autoresearch` and `researcher-quick` skills to prefer Crawl4AI + agent-browser before raw browser.
- Add X/Twitter signal adapters (web2cli-style or Crawl4AI + stealth for broader signals).
- Build simple "site intelligence" skill (one-shot market/design/competitor snapshot using the new stack).
- Wire into gbrain for durable capture of high-value research artifacts.
- Success metric: Measurable increase in source diversity + quality in autoresearch results logs; lower "external research failed" rate.

### Phase 2 — Execution Workers & Full Harness Upgrade (2-3 months)
- Evaluate browser-use as production replacement/augmentation for `browser-harness-power-use`.
- Upgrade QA smoke + Builder execution to use the best combination (agent-browser for most, deep agent for complex).
- Add vision fallback (Skyvern or existing) only for visual-heavy cases.
- Persistent cross-worker profile & auth vault strategy.
- Memory / cost dashboards tied to ops-watch.
- Success metric: QA regression reproduction success rate on real sites; Builder can complete end-to-end web tasks autonomously with proof.

### Phase 3 — Governance, Evals, Polish (ongoing)
- Formal web-access eval suite (anti-bot matrix, auth persistence, token budgets, success rate by site category).
- Keep proxy/stealth/cloud fallback as manual-gated escalation only; no default service, rotation, or bypass path.
- Optional: BrowserOS evaluation as "full agentic desktop browser" mode.
- Skill marketplace / internal versioning for the new web skills.
- Regular drift audits (researcher + km-agent).

## Concrete First Actions (Immediate Execution)

1. **Install & Skill-ify Vercel agent-browser** (today/tomorrow)
   ```bash
   npm i -g agent-browser && agent-browser install
   agent-browser skills list
   # Then create wrappers in ~/.hermes/skills/ and hermes-workspace/skills/
   ```

2. **Stand up Crawl4AI local service**
   ```bash
   docker pull unclecode/crawl4ai:0.8.5
   docker run -d -p 11235:11235 --shm-size=1g --name crawl4ai unclecode/crawl4ai:0.8.5
   # Test from researcher context
   ```

3. **Create the skill files** (see follow-up artifacts below or in next PR).

4. **Minimal swarm.yaml deltas** (example for researcher):
   Add under tools/skills for researcher:
   - `crawl4ai`
   - `agent-browser`
   - `agent-browser-research`

5. **Profile-level SOUL.md / config updates** per worker to bias toward new stack (GBrain first, then Crawl4AI breadth, then agent-browser interaction).

## Risks & Mitigations
- Legal/ToS: Document "respect robots.txt + site terms; use for legitimate research/automation only". Add guard in researcher contract.
- CAPTCHAs / hardest sites: classify and stop by default. Any investigation beyond classification needs explicit Orchestrator greenlight, safe/legal target ownership, and a written stop condition.
- Maintenance: Pin versions, own the eval suite, schedule quarterly refresh.
- Context bloat: Enforce the compact ref + cleaned Markdown discipline from agent-browser + Crawl4AI.
- Over-adoption: Start with Researcher + QA only; expand only after proven metrics.

## Success Definition
- Researcher can complete 3x wider external research loops with higher source quality and lower cost/failure.
- QA reproduces real-world browser bugs reliably with screenshots + traces.
- Builder can execute complex web tasks (auth + multi-step) with proof.
- All new capabilities are callable as native skills/tools from the swarm workers with minimal new MCP surface.
- Full alignment with standalone doctrine: browser/CLI evidence first, project skills first.

## Next Immediate Deliverables (after this plan)
- Skill stubs for `agent-browser-core` and `crawl4ai-research`.
- Docker compose addition for Crawl4AI in dev/prod.
- Updated researcher-autoresearch contract examples using the new stack.
- Eval matrix + first 20 hard sites.
- PR to hermes-workspace + corresponding ~/.hermes profile/skill updates.

**This plan turns the current "web" and "browser" declarations from aspirational into a genuine superpower for the Idea Engine (Researcher + Strategist) and the full Hermes swarm execution surface.**

Ready to execute Phase 0. Point me at the first skill to author or the first eval set to build.
