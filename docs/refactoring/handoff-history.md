# Handoff history (unpruned session notes)

> Historical HANDOFF.md content, preserved verbatim at prune time (2026-10-18).
> Current working rules live in the root `HANDOFF.md`.

# HANDOFF.md — session entry point

**Purpose:** any session (human, agent, subagent) reads this first.

## Reading order

1. `docs/refactoring/PLAN.md` — the current full-sweep refactor plan, baseline and rules
2. `docs/refactoring/EXECUTION-LOG.md` — append-only log of executed phases
3. `docs/refactoring/DELETED-FILES.md` — every destructive deletion and why
4. `git log --oneline -20` — commits are the source of truth, one task per commit
5. Historical session notes: `docs/refactoring/handoff-history.md`

## Working rules

- One task per commit; `pnpm test` must be green before each commit
- Never hand-edit `src/routeTree.gen.ts` — regenerate via `pnpm dev`,
  start briefly, then kill
- Tests red → do not commit: report failing test name + observed vs expected
  in a new "⚠️ Blockers" section here
- Destructive deletions must be flagged in `docs/refactoring/DELETED-FILES.md`

## Current battery (must be green before closeout)

- `pnpm test` (vitest, 40 files / 145 passed + 2 skipped)
- `pnpm build`
- `pnpm exec tsc --noEmit` (known pre-existing errors documented in PLAN.md)
- `pnpm test:ops`

## Known pre-existing issues (documented on purpose, not refactor blockers)

- `tsc` backlog in `lib/gateway-api.test.ts`, `lib/cron-api.test.ts`,
  `components/usage-meter/usage-details-modal.tsx`, `routes/api/history.ts`
- `pnpm lint` error backlog (largely auto-fixable) — dedicated lint-sweep PR
  recommended: `pnpm exec eslint --fix`
