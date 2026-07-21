# Autoresearch Mode

Autoresearch is a bounded optimization harness for Hermes Agents. It is not the default research workflow.

Use it only when the system can mechanically decide whether an iteration improved.

```text
normal research     = gather evidence -> synthesize -> recommend
autoresearch mode   = mutate one target -> verify metric -> keep/revert -> repeat
```

## Source pattern

The useful pattern from Karpathy-style autoresearch and downstream Claude/Codex ports is stable:

1. Lock the scope.
2. Lock the evaluation surface.
3. Pick one scalar metric.
4. Mutate one narrow target.
5. Run a mechanical verifier.
6. Keep improvements.
7. Revert worse/crashing/guard-failing changes.
8. Log every iteration.
9. Stop at the configured budget.

If you cannot evaluate it mechanically, do not autoresearch it.

## When to use `researcher:quick`

Use normal researcher mode for:

- web/GitHub/X/Reddit/Medium/YouTube/source collection
- market/model/library scans
- literature review
- qualitative synthesis
- tradeoff notes
- recommendations where judgment matters

`researcher:quick` may produce an autoresearch config, but it should not start the loop unless the contract below is filled.

## Autoresearch entry contract

A loop may start only when these fields are explicit:

```yaml
goal: <one sentence outcome>
scope: <files/directories/knobs the loop may edit>
mutable_target: <specific file, skill, prompt, or narrow directory>
locked_eval: <files/datasets/scoring scripts the loop may not edit>
metric: <scalar number and unit>
direction: higher|lower
verify: <command that emits or lets us parse the metric>
guard: <command(s) that must keep passing>
iterations: <bounded count; default pilot is 3-5>
time_budget: <optional wall-clock cap>
results_log: autoresearch-results/results.tsv
rollback: revert worse, crashing, unparsable, or guard-failing changes
greenlight: required for destructive, public, credential, account, push, deploy, merge, or bulk edits
```

Do not infer missing fields silently. If a field is unknown, run `autoresearch:plan` / planning mode first.

## Iteration discipline

Each iteration should follow this shape:

```text
1. Read current state, prior results log, and recent git history.
2. Pick one small, falsifiable change.
3. Edit only allowed mutable targets.
4. Commit or checkpoint the candidate.
5. Run verify and guard commands.
6. Parse metric.
7. If improved and guards pass: keep.
8. If worse, equal-with-more-complexity, crashed, or guards fail: revert.
9. Append results_log.
10. Continue until iteration/time budget is exhausted.
```

Use simplicity as a tie-breaker: equal metric with less code/complexity may be kept; equal metric with more complexity must be reverted.

## Required log shape

Use TSV or JSONL. TSV default:

```tsv
iteration	commit	metric	delta	status	summary	verify	guard
0	baseline	42	0	baseline	initial metric	pass	pass
1	abc123	39	-3	keep	reduced failing lint count in parser	pass	pass
2	-	45	+6	revert	broadened change broke type guard	pass	fail
```

Keep failures visible. Reverting a failed experiment is part of the evidence trail, not a problem to hide.

## Role ownership

- `orchestrator`: approves entering autoresearch, locks scope/eval/metric/budget, and decides whether the loop may run in durable/background mode.
- `researcher:quick`: gathers external/internal evidence and may draft the contract.
- `researcher:autoresearch`: runs the loop after the contract is complete.
- `reviewer`: checks kept changes for metric hacking, overfitting, security regressions, and hidden scope expansion.
- `qa`: replays final verification and any browser/API smoke.
- `km-agent`: promotes durable lessons/results into RAZSOC/GBrain after review.

## Good targets for this stack

### 1. Hermes skill optimization

Improve one skill against fixed prompts and binary rubric checks.

```yaml
goal: Improve reviewer-core bug catching without increasing false positives.
scope:
  - /home/aleks/.hermes/skills/**/reviewer-core/SKILL.md
mutable_target: reviewer-core/SKILL.md
locked_eval:
  - evals/reviewer-core/cases/*.md
  - evals/reviewer-core/rubric.json
metric: rubric score out of 100
direction: higher
verify: python evals/reviewer-core/run_eval.py --json
guard: hermes chat -Q -t reviewer:gate -q 'load reviewer-core and summarize readiness' | grep -q reviewer
iterations: 3
```

### 2. Profile prompt optimization

Tune one profile against fixed briefs.

```yaml
goal: Make researcher choose GBrain-first lookup reliably before web search.
scope:
  - /home/aleks/.hermes/profiles/researcher/SOUL.md
  - /home/aleks/.hermes/profiles/researcher/skills/researcher-quick/SKILL.md
mutable_target: researcher profile guidance
locked_eval:
  - evals/researcher-routing/cases.jsonl
metric: pass rate across routing cases
direction: higher
verify: python evals/researcher-routing/run_eval.py
guard: hermes chat -Q -t researcher:quick -q 'respond with mode readiness only'
iterations: 3
```

### 3. GBrain retrieval routing

Optimize route rules/prompts against known-answer fixtures. The corpus and answer key are locked.

```yaml
goal: Improve citation-correct answers for RAZSOC/GBrain architecture questions.
scope:
  - skills/note-taking/gbrain/SKILL.md
  - profiles/km-agent/SOUL.md
mutable_target: retrieval/routing guidance only
locked_eval:
  - evals/gbrain-routing/questions.jsonl
  - evals/gbrain-routing/answers.jsonl
metric: exact-or-cited-correct score
direction: higher
verify: python evals/gbrain-routing/run_eval.py --max-cases 12
guard: gbrain stats >/dev/null
iterations: 3
```

### 4. Repo cleanup loop

Reduce one failure class with focused guards.

```yaml
goal: Reduce no-explicit-any count in changed TypeScript files.
scope:
  - src/**/*.ts
  - src/**/*.tsx
mutable_target: one module or route family per iteration
locked_eval:
  - package.json
  - eslint config
metric: eslint no-explicit-any violation count
direction: lower
verify: pnpm exec eslint src --format json | python scripts/count-eslint-rule.py @typescript-eslint/no-explicit-any
guard: pnpm exec vitest run <focused-tests>
iterations: 5
```

### 5. Browser/QA harness improvement

Use only deterministic checks.

```yaml
goal: Increase deterministic /swarm smoke coverage.
scope:
  - tests/browser/swarm-smoke.*
  - src/routes/**/swarm*
mutable_target: smoke test file first; product code only with explicit approval
locked_eval:
  - expected role list
  - API response assertions
metric: passing smoke assertions count
direction: higher
verify: pnpm exec playwright test tests/browser/swarm-smoke.spec.ts --reporter=json
guard: pnpm exec vitest run src/server/swarm-health.test.ts
iterations: 3
```

## Bad targets / red flags

Do not run autoresearch when:

- the loop can edit the eval, dataset, scorer, or answer key
- the metric is a proxy that can be gamed easily
- the desired improvement is mostly taste or strategy
- the work touches secrets, account settings, public posting, deploys, merges, or destructive cleanup
- the scope is broad enough to rewrite the vault/repo
- the verification command is slow, flaky, or manually judged
- the agent cannot parse the metric deterministically

Common reward-hacking examples:

- deleting hard tests to improve pass rate
- changing a rubric/answer key instead of behavior
- caching fixture outputs instead of solving the task
- suppressing errors instead of fixing causes
- narrowing search to known examples only
- adding brittle sleeps/retries to hide flake

## Pilot before background

Default wedge:

1. Run `researcher:quick` to draft the contract.
2. Run `reviewer` on the contract for metric-hacking risk.
3. Run `researcher:autoresearch` for 3 iterations foreground/durable-session only.
4. Run `reviewer` on kept diffs.
5. Run `qa` or focused verification.
6. Let `km-agent` capture only durable lessons.

Only after a clean pilot should an orchestrator approve a longer or background loop.

## Exit report

Every run must finish with:

```text
Goal:
Scope:
Metric baseline -> final:
Iterations attempted:
Kept changes:
Reverted changes:
Verification:
Guard result:
Reward-hacking review:
Remaining risks:
Next recommended loop or stop condition:
```
