# Refactoring Plan — Hermes Workspace (Full Sweep)

**Branch:** `refactor/full-sweep` · **Started:** 2026-10-18 · **Status doc:** this file (updated per phase)

Baseline (2026-10-18): `pnpm test` 42 files / 154 passed, 2 skipped · `pnpm build` green · `tsc --noEmit` 24 pre-existing errors in 7 files · `pnpm lint` 979 errors / 114 warnings (645 auto-fixable — NOT mass-fixed in this sweep to avoid churn).

## Phases

- [x] **Phase 0** — Baseline + docs/refactoring skeleton
- [x] **Phase 1** — Secrets & .gitignore remediation (see DELETED-FILES.md; owner action: rotate keys recovered in history — commit `1026571c`)
- [x] **Phase 2** — Root debris removal (10 python scripts, run-server.js, keep-alive.sh, sbom artifacts, accident dirs, freerouter moved out)
- [x] **Phase 3** — Dead code removal in src/ (~9,900 lines: gateway orphan cluster, agent-view/agent-chat, memory-viewer, swarm2 UI+backend, /api/send stub, files-screen)
- [x] **Phase 4** — Deduplication (model-name logic → lib/providers/)
- [x] **Phase 5** — Split oversized server endpoint files (send-stream split; UI mega-splits deferred — see EXECUTION-LOG.md)
- [x] **Phase 6** — Test/tooling fixes (@playwright/test added, test:e2e wired, typecheck script, prettier cleanup)
- [x] **Phase 7** — ai-protect packages wired (real exports fields + workspace deps usable by name)
- [x] **Phase 8** — Docs consolidation (docs/archive/, root doc moves, HANDOFF prune)
- [ ] **Phase 9** — Final verification & closeout

## Rules of engagement

1. One task per commit; `pnpm test` green before each commit.
2. Never hand-edit `src/routeTree.gen.ts` — regenerate.
3. Destructive deletions flagged in DELETED-FILES.md with justification.

## Known pre-existing issues NOT fixed here (documented on purpose)

- 24 `tsc` errors in: `lib/gateway-api.test.ts` (6), `lib/cron-api.test.ts` (6), `components/usage-meter/usage-details-modal.tsx` (6), `server/jobs-profile-resolution.test.ts` (2), `routes/api/swarm-kanban.ts` (2 — file later deleted in Phase 3), `routes/api/history.ts` (1), `playwright.config.ts` (1 — fixed in Phase 6).
- `pnpm lint` error backlog (largely auto-fixable) — recommend a dedicated lint-sweep PR: `pnpm exec eslint --fix`.
