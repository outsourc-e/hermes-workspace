# Refactoring Plan — Hermes Workspace (Full Sweep)

**Branch:** `refactor/full-sweep` · **Started:** 2026-10-18 · **Status doc:** this file (updated per phase)

Baseline (2026-10-18): `pnpm test` 42 files / 154 passed, 2 skipped · `pnpm build` green · `tsc --noEmit` 24 pre-existing errors in 7 files · `pnpm lint` 979 errors / 114 warnings (645 auto-fixable — NOT mass-fixed in this sweep to avoid churn).

## Phases

- [x] **Phase 0** — Baseline + docs/refactoring skeleton
- [x] **Phase 1** — Secrets & .gitignore remediation (see DELETED-FILES.md; owner action: rotate keys recovered in history — commit `1026571c`)
- [x] **Phase 2** — Root debris removal (10 python scripts, run-server.js, keep-alive.sh, sbom artifacts, accident dirs, freerouter moved out)
- [x] **Phase 3** — Dead code removal in src/ (~9,900 lines: gateway orphan cluster, agent-view/agent-chat, memory-viewer, swarm2 UI+backend, /api/send stub, files-screen)
- [x] **Phase 4** — Deduplication (model-name logic → lib/providers/)
- [x] **Phase 5** — Split oversized files: send-stream (→chat-store-helpers), chat-store 1,331→929, conductor 2,499→2,227, chat-screen 2,785→2,468; useState-mega-splits (chat-composer, message-item, chat-message-list, providers-screen, knowledge-browser-screen) deferred pending visual QA (see EXECUTION-LOG.md)
- [x] **Phase 6** — Test/tooling fixes (@playwright/test added, test:e2e wired, typecheck script)
- [x] **Phase 7** — ai-protect packages wired: real exports maps, root workspace deps, subpath vitest aliases, tests import by package name; MV3 extension bundler (`apps/extension/build.mjs`, sha256 shim verified against node crypto); README-AI-PROTECT → docs/ai-protect/
- [x] **Phase 8** — Docs consolidation (docs/archive/, root doc moves, HANDOFF prune to entry point + docs/refactoring/handoff-history.md)
- [x] **Phase 9** — Final verification: `pnpm test` 40 files / 145 pass + 2 skip, `pnpm build` green, `tsc --noEmit` 21 pre-existing errors (down from 24; swarm-kanban file deleted, playwright config fixed), ops battery green 2026-10-18 15:19 per docs/EVOLVING-TESTING-DOCUMENTATION.md (`test:ops` script-exit hangs on mock runner in sandbox; smoke:managed needs deployed :4445 — not running here)

## Rules of engagement

1. One task per commit; `pnpm test` green before each commit.
2. Never hand-edit `src/routeTree.gen.ts` — regenerate.
3. Destructive deletions flagged in DELETED-FILES.md with justification.

## Known pre-existing issues NOT fixed here (documented on purpose)

- 21 `tsc` errors in: `lib/gateway-api.test.ts` (6), `lib/cron-api.test.ts` (6), `components/usage-meter/usage-details-modal.tsx` (6), `server/jobs-profile-resolution.test.ts` (2), `routes/api/history.ts` (1). *(Playwright config — fixed in Phase 6; swarm-kanban route — file deleted in Phase 3.)*
- `pnpm lint` error backlog (largely auto-fixable) — recommend a dedicated lint-sweep PR: `pnpm exec eslint --fix`.
