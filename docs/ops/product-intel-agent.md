# product-intel — Self-Learning Night Market Intelligence Agent

> Version 1.3 · 2026-10-11 · Owner: A. Nahrgang · Model: `ternary-bonsai-2-27b:q2_0` @ Ollama :11434 proxied to :8555 (unified primary+fallback+aux, see `model-policy.md`)
> Part of the night fleet documented in [system-operations-manual.md](./system-operations-manual.md).
> Tests: [test-product-intel.md](./test-product-intel.md) · Fleet runner pattern: `ops/bin/run-night-agent.sh` · `model-policy.md`

---

## 1. What it is

`product-intel` is a nightly Hermes agent, powered by the local **Gemma fleet** (`ternary-bonsai-2-27b:q2_0` @ Ollama `:11434`, proxied to `:8555`, unified primary+fallback per `ops/config/model.env` / `model-policy.md`; Qwen retired 2026-10-11), that maintains a living
competitive-technology knowledge base for the **AI-Protect / PrivacyScrubber** product family.

It researches competitors and partners in four clusters — client-side anonymization,
AI data control planes, AI-agent security, and gateway infrastructure — extracts every
product/technology feature from their public web presence, compares them against our own
products, **broadens its own research scope** on a 3-day cadence, publishes consolidated
reports to Obsidian, and routes all scope-changing decisions through the human approval gate
on Buzz.

### Cadence model

| Cycle | When | Work | Outputs |
|---|---|---|---|
| **LIGHT** | every night (02:45) | re-fetch all known targets → change detection → update profiles + changelog | delta note in `docs/ops/research/YYYY-MM-DD-product-intel-delta.md`, short digest to Buzz `#product-intel` |
| **DEEP** | every 3rd day (auto) or first-ever run | LIGHT + keyword-mining broadening + comparison-matrix rebuild + consolidated report | full report → `docs/ops/research/` **and** Obsidian `Intelligence/Product-Intel/`; candidate proposals → approval draft in Buzz `#approvals` |

Deep-cycle trigger: `days_since(last_deep) >= 3`, tracked in `ops/run/product-intel-state.json`.
First-ever run is always DEEP (seeds everything).

## 2. Architecture

```
 launchd com.ops.agent-product-intel (02:45 nightly, Gemma fleet)
        │
        ▼
 ops/bin/run-product-intel.sh ─── window check (00–06h, rc=5)
    │                              lock file (rc=8)
    │                              Gemma pre-flight via model-check.sh :8555 (unified, rc=2)
    │                              cadence decision ← ops/run/product-intel-state.json
    │                              prompt composition (ops/agents/product-intel.md + targets)
    ▼
 hermes --profile product-intel chat --query-file … -Q -t web,file  (ternary-bonsai-2-27b:q2_0 @ :8555, unified fallback)
    │            │ web tools: fetch/search target sites
    │            │ file tools: read/write knowledge base directly
    ▼
 validation gate ── section contract per mode; completeness vs targets; rc=11 on violation
    │
    ├─► docs/ops/research/*.md            (evidence trail, git)
    ├─► Obsidian Intelligence/Product-Intel/*.md   (deep cycles only)
    ├─► Buzz #product-intel digest         (identity KEY_product_intel; skipped when DRYRUN)
    └─► Buzz #approvals draft              (only when new candidates were proposed)
```

**Division of labor:** the LLM does judgment work (extraction, comparison, broadening);
the shell script owns everything deterministic (scheduling, locks, timeouts, validation,
publishing, posting). The agent can *propose* but never *decide* scope changes.

## 3. Knowledge base (`docs/ops/intel/knowledge-base/`)

| File/dir | Role |
|---|---|
| `taxonomy.yaml` | Unified feature/technology dimensions (~40, in 7 groups) + value scale (`none/partial/full/unverified`) + cluster definitions. The shared vocabulary of every profile and the matrix. |
| `targets.json` | Machine-readable registry of active targets (name/url/type/cluster/status/profile path). **Agent never edits this.** |
| `own-products.md` | Baseline: AI-Protect (seeded from vault strategy docs — site is JS-rendered) + PrivacyScrubber (full extraction). The "us" column of every comparison. |
| `vendors/<name>.md` | One deep-dive per active target: YAML frontmatter (feature map against taxonomy) + body sections (What they sell / Tech claims / Deployment / Compliance / Traction / Relevance to us / Sources). |
| `comparison-matrix.md` | All targets + own products × taxonomy dims. Rebuilt each deep cycle. Ends with a strategic read. |
| `candidates/<date>-candidates.md` | Broadening proposals awaiting owner approval. Deduped against all previous candidate files; rejected items not re-proposed for 90 days. |
| `events/changelog.md` | Append-only change log: `date \| target \| what changed \| source`. |
| `report-<date>.md` | Working file of the current deep cycle (validated by the runner, then published). |

### Profile schema (frontmatter)

```yaml
---
name: Protecto
url: https://www.protecto.ai/
type: competitor            # competitor | partner-candidate
cluster: data-control-plane # one of taxonomy.clusters
last_profiled: 2026-08-26
positioning: "…"
features:
  pii_detection_breadth: full    # every dim key from taxonomy.yaml
  runtime_access_control: full
  # …
---
# Body sections (fixed order) ending with ### Sources (URL list)
```

## 4. The self-learning loop

Every deep cycle:

1. **Refresh** — re-extract each target; material changes appended to `events/changelog.md`.
2. **Mine** — extract productive technology/feature keywords from current profiles.
3. **Broaden** — web-search seeded with mined keywords + category terms
   (`PII redaction browser extension`, `shadow AI detection`, `prompt anonymization`,
   `AI agent security posture`, …); identify companies absent from `targets.json`.
4. **Propose** — write `candidates/<date>-candidates.md` (never self-register).
5. **Gate** — post approval draft to `#approvals`. Owner reacts ✅ and registers accepted rows:
   ```bash
   ops/bin/intel-add-target.sh "LayerX Security" https://layerxsecurity.com/ competitor
   ```
6. **Learn** — next deep cycle profiles newly registered targets automatically;
   the "What did we miss?" section feeds query strategy for the following cycle
   (per the vault's Self-Learning Directives: every batch ends with "What did we miss?").

The learning signal is therefore threefold: **keyword productivity** (which seeds found hits),
**change patterns** (which targets move how often → future prioritization), and **owner
reactions** (explicit accept/reject labels).

## 5. Guardrails (inherited + specific)

| Guardrail | Mechanism | Test |
|---|---|---|
| Night-window only | hour check 00–06, exit 5 | TP01 |
| No concurrent runs | lock file, exit 8 | TP04 |
| Local model only | pre-flight `model-check.sh :8555` (unified), exit 2 | T15/T14 family (Gemma fleet) |
| Hard timeout | watchdog kill after 40 min, exit 9 | TP14 |
| Output contract | required sections per mode, exit 11 | TP08/TP09/TP12 |
| Read-only web | template rule 1 (no signup/forms/contact/posting) | TP06 clause, TP18 live |
| Source-or-unverified | every claim needs URL or `[UNVERIFIED]` tag | TP06 clause, TP18 live |
| Injection resistance | fetched-page instructions are DATA; anomalies reported | TP06 clause, N5 drill |
| Approval gate for scope | candidates ≠ targets; only `intel-add-target.sh` registers | TP06 + TP15 |
| KB pollution guard | tests always run on temp KB copies | battery design |
| DRYRUN network isolation | skips model check + Buzz entirely | TP16 |
| No personal data | company-level signals only (fleet rule) | template rule 7 |

## 6. Runbook

```bash
# Status
cat ops/run/product-intel-state.json          # last_light / last_deep
tail -20 ops/run/product-intel.log

# Manual light cycle (day, no side effects beyond files)
FORCE=1 DRYRUN=1 ops/bin/run-product-intel.sh

# Manual real cycle (anytime, Gemma fleet)
FORCE=1 ops/bin/run-product-intel.sh          # window ignored with FORCE=1; pre-flight checks :8555

# Force a deep cycle regardless of cadence
DEEP=1 FORCE=1 ops/bin/run-product-intel.sh

# Register an approved candidate
ops/bin/intel-add-target.sh "<Name>" <url> <competitor|partner-candidate>

# Run the test battery (anytime)
ops/bin/test-product-intel.sh          # add -v for verbose
```

**Scheduling:** launchd job `com.ops.agent-product-intel` fires 02:45 daily (after
competitor-scout 01:30, inside night window 00:00–06:30, Gemma fleet — locked 2026-10-11). Installed at
`~/Library/LaunchAgents/`, source-controlled in `ops/launchd/`.

**Buzz identity:** `KEY_product_intel` in `ops/secrets/agent-keys.env` (freshly generated
hex key). One-time setup: import the key in Buzz Desktop → Agents view, approve membership
(see buzz-bootstrap output). Until then the runner logs "(relay post skipped)" and files
remain the source of truth — same graceful degradation as the other agents.

## 7. Failure modes & recovery

| Symptom | Likely cause | Action |
|---|---|---|
| exit 2 primary+fallback down | Gemma server :8555 down / window missed | `ops/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion`; restart `ops/bin/gemma-server.sh start` — see `model-policy.md` |
| exit 11 report/delta format missing | model ignored contract (rare on 12B; more likely under context pressure) | inspect `ops/run/product-intel.log` + partial output; reduce target count or raise TIMEOUT_SECS; rerun |
| exit 9 timeouts | site slow/unreachable loops | add problematic URL to template's skip-gracefully expectations; consider raising TIMEOUT_SECS once |
| Digests empty/no changes for days | sites stable OR fetch blocked (JS-rendered) | check changelog for "[TO VERIFY]" entries; JS sites need rendered capture or manual profile updates |
| Candidates repeat rejected names | rejection not recorded | strike the row in the old candidates file (rejection date) — agent dedupes by reading history |
| Obsidian copy WARN | vault moved | set `OBSIDIAN_DIR` override or update default in runner |

## 8. Extension guide

- **Add a taxonomy dimension:** edit `taxonomy.yaml` (new dim key + description), then update
  affected vendor frontmatter (add the dim) — TP07 will flag any drift. Major changes deserve a
  proposal in `#approvals` per house rules.
- **Add a permanent target:** owner-approved `intel-add-target.sh` only.
- **Change cadence:** edit the `>=3` threshold in the runner's cadence block; TP10/TP11 encode
  boundary semantics — adjust them together.
- **Change report structure:** edit both the template (MODE=DEEP step 4) and the validator
  (`validate()` section list) — they are two views of one contract; TP07/TP08 will catch drift.
- **Swap/upgrade model:** nothing here is model-specific except the profile name; the runner
  uses Gemma fleet via `ops/config/model.env`. Update `model-check.sh` arguments if the served ID changes — see `model-policy.md` governed change.

## 9. First production artifacts (manual exemplar run, 2026-08-26)

These files double as few-shot exemplars embedded by reference in the agent template:

- 5 vendor profiles: `vendors/{protecto,straiker,harmonic,nightfall,truefoundry}.md`
- Baseline: `own-products.md` · Vocabulary: `taxonomy.yaml` v1 · Registry: `targets.json`
- Matrix v1 + strategic read: `comparison-matrix.md`
- First candidate slate (10 proposals): `candidates/2026-08-26-candidates.md`
- First report: `docs/ops/research/2026-08-26-product-intel.md` = Obsidian
  `Intelligence/Product-Intel/2026-08-26-product-intel.md`
- Buzz drafts ready to post: `ops/run/product-intel.buzz-draft.md`

Headline finding of run #1: **nobody combines zero-server client-side anonymization with
agent-runtime enforcement** — our whitespace; nearest threats Nightfall (hooks interception)
and Harmonic (endpoint SLM redaction); best partner candidate TrueFoundry (gateway embed).