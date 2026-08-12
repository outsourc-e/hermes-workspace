# Orchestrator Routing

## Goal Archetypes

| Archetype | Trigger Keywords | Mode | Preset Pipeline |
|---|---|---|---|
| `ship-ready` | ship, release, deploy, publish, production-ready, merge | loop | probe, debug, fix, regression, ship |
| `optimize-metric` | improve, optimize, increase, reduce, faster, smaller, coverage, score | loop | plan, (classic loop), evals |
| `fix-broken` | fix, broken, failing, error, crash, bug, can't run, tests fail | loop | debug, fix, regression |
| `harden` | security, vulnerability, audit, OWASP, CVE, harden, lock down | loop | security, fix, security |
| `build-feature` | build, add, implement, create, new feature, acceptance test | loop | (acceptance-test derive), debug, fix, regression |
| `explore` | understand, explore, investigate, what does, how does, edge cases | loop | probe, scenario, plan |
| `document` | document, wiki, generate docs, explain codebase, write guide | dispatch | learn |
| `what-to-build` | what should I build, ideas, improvements, PRD, roadmap | dispatch | improve |
| `decide-design` | which approach, compare options, design decision, architecture choice | dispatch | reason |

Keyword matching is fuzzy — partial matches and synonyms qualify. When a goal matches multiple archetypes, prefer the more specific one (fix-broken over explore; ship-ready over fix-broken if "ship" is explicit). When ambiguous, show the top two candidates in the upfront confirm and let the user choose.

## Router Decision Table

The `next-hop` subcommand of `scripts/orchestrate.sh` reads `orchestrator-state.json` and applies these rules in order. First match wins.

| State Signal | Source | Next Hop |
|---|---|---|
| `errors > 0` in last handoff | handoff.json `findings` | `fix` |
| regression verdict `UNSTABLE` | handoff.json `verdict` | `regression` |
| `untested_gaps` flagged | handoff.json or units output | `debug` |
| `pending_verify` true | orchestrator-state.json | `verify` (fresh independent acceptance check) |
| predicate met | Success predicate command exit/output | `DONE` (exit loop) |
| hop outcome `blocked` or `failed`, no retry route | orchestrator-state.json | `BLOCKED` (checkpoint + stop) |
| plateau detected | `scripts/orchestrate.sh plateau` | `PLATEAU` (stop + report) |
| archetype pipeline has remaining steps | preset pipeline sequence | next preset step |
| all preset steps exhausted, predicate not met | — | `regression` (convergence re-check) |

State signals are cheap reads — last `handoff.json` plus the regression verdict field and error count. No re-run of the full suite just to route.

## Independent Verify & Overfit Guard

The orchestrator must not optimize and accept against the same signal — that lets a
change game its own metric. For `optimize-metric` and `build-feature`, the acceptance
check runs on a **held-out** set (a fresh scenario set or holdout assertions), separate
from the `units` signal used to choose the change. When a high-impact change is accepted
on the working signal, the orchestrator sets `pending_verify` in `orchestrator-state.json`;
`next-hop` then routes to a **verify** hop (dispatched to `reason` or `predict` as an
independent adversarial check) before declaring `DONE` or shipping. The verify hop is
advisory input to convergence — it never auto-approves ship, which stays human-gated.

## Two-Mode Split

**Orchestration loop** — used when the goal has an external, mechanical Success predicate: a shell command that returns a value the orchestrator can compare across cycles. Progress is objective (Units remaining falls), plateau is well-defined, and the loop terminates on convergence or a safety backstop. Archetypes: ship-ready, optimize-metric, fix-broken, harden, build-feature, explore.

**Single-pass dispatch** — used when no mechanical predicate exists. The goal is subjective or the subcommand is internally-converging (reason runs its own adversarial loop) or a one-shot terminal emitter (learn, improve produce a document and stop). The orchestrator routes once, the subcommand self-terminates, and the orchestrator reports the result. No Units remaining, no Plateau counter, no ship gate. Archetypes: document, what-to-build, decide-design.

The criterion is: "Can the orchestrator independently verify done without re-running the subcommand?" If yes → loop. If no → dispatch.

## Build-Feature: TDD Ladder

The `build-feature` archetype has no pre-existing metric, so progress is reframed as `green-assertion-count` (monotone integer, higher-is-better). A change that turns a red sub-test green is kept; a change that regresses a green sub-test is reverted. A floor-guard prevents reverting scaffolding commits that compile and add no new failures but pass zero new tests. Large net-new scope (greenfield with no existing test suite) is detected and the orchestrator advises handing off to a dedicated build command rather than grinding cycles.

## Preset Pipelines (Reference)

| Archetype | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 |
|---|---|---|---|---|---|
| ship-ready | probe | debug | fix | regression | ship |
| optimize-metric | plan | (classic loop) | holdout-verify | evals | — |
| fix-broken | debug | fix | regression | — | — |
| harden | security | fix | security | — | — |
| build-feature | (acceptance-test derive) | debug | fix | regression | — |
| explore | probe | scenario | plan | — | — |
| document | learn | — | — | — | — |
| what-to-build | improve | — | — | — | — |
| decide-design | reason | — | — | — | — |

Presets are starting pipelines. The router adapts per cycle from observed state — it may skip, repeat, or reorder steps based on the decision table above. The preset is a prior, not a fixed schedule.

## Glossary

Terms used consistently across this file, SKILL.md, and orchestrator-state.json. Definitions live in CONTEXT.md.

| Term | Short meaning |
|---|---|
| Goal archetype | Classification of the user's natural-language goal into one of the 9 categories above |
| Success predicate | Exact shell command + expected output that defines "done" for Orchestration loop goals |
| Units remaining | Scalar measure of open gaps (failing tests, errors, metric delta); lower-is-better; computed by `scripts/orchestrate.sh units` |
| Plateau | Units remaining flat or worse for N consecutive computed cycles (default 5); oscillation that nets zero also qualifies |
| Orchestration loop | The cycle-bounded assess→route→run→record loop used for predicate-bearing archetypes |
| Single-pass dispatch | One-shot routing to a self-terminating subcommand; no loop, Plateau, ceiling, or ship gate |
| Independent verify hop | A `verify` routing step (reason/predict) that checks an accepted high-impact change against a fresh signal before DONE/ship; gated by `pending_verify` |
| Holdout-verify | Acceptance check run on a held-out set, separate from the `units` signal used to choose the change, to prevent overfitting the metric |
