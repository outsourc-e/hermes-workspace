# Execution Log — Full Sweep Refactor

Append-only. One row per committed task.

| Date | Phase | Commit | What | Verify |
|------|-------|--------|------|--------|
| 2026-10-18 | 0 | (docs) | Baseline recorded: 154 tests pass, build green, tsc 24e, lint 979e | local |
| 2026-10-18 | 1 | ef7a9d72 | Blanket .env* gitignore + generated-artifact ignores; removed tracked QA doc from index | grep .gitignore |
| 2026-10-18 | 2 | 46d99f43 | Root debris: 10 py one-offs, run-server.js, keep-alive.sh, sbom artifacts deleted; freerouter moved out | pnpm test green |
| 2026-10-18 | 3 | e83c7c19 | Delete dead /api/send 501 stub; routeTree regenerated | pnpm test green |
| 2026-10-18 | 3 | 64d19943 | Delete ~10.9k lines confirmed-orphan UI clusters (gateway agent-hub, swarm2+kanban backend, agent-chat, memory-viewer, files-screen, most of agent-view; agent-progress.tsx kept) | pnpm test green, build green |
| 2026-10-18 | 3 | b383b2e1 | Delete src/server/gateway.ts (868 lines, legacy WS client, zero importers) | pnpm test green |
| 2026-10-18 | 3 | 77b3ff7c | Delete orphaned orchestrator-avatar.tsx (1,490 lines) + dead hooks use-agent-view / use-orchestrator-state | pnpm test green |
| 2026-10-18 | 4 | 9f2a8122 | Canonical THEME_PREVIEWS + shared ThemeSwatch in settings/shared | pnpm test green |
| 2026-10-18 | 4 | 13153742 | PROVIDER_DIRECTORY single source for provider identity (dialog + onboarding derive) | pnpm test green |
| 2026-10-18 | 5 | c6cbb5da | send-stream.ts 943→719; pure helpers to src/server/send-stream-helpers.ts | pnpm test green |
| 2026-10-18 | 5 | d43070e4 | chat-store.ts 1,331→929; 23 pure helpers to src/stores/chat-store-helpers.ts | pnpm test green |
| 2026-10-18 | 5 | 407f41a2 | conductor.tsx 2,499→2,227; pure helpers/types to conductor/utils.ts | pnpm test green |
| 2026-10-18 | 5 | d08abae8 | chat-screen.tsx 2,785→2,468; aux helpers to tested chat-screen-utils.ts | pnpm test green |
| 2026-10-18 | 6 | 26ed29cd | @playwright/test wired; e2e gated by AI_PROTECT_E2E; manifest-shape unit test; typecheck script | pnpm test 40 files green |
| 2026-10-18 | 7 | 301cf24b | Workspace wiring: real exports maps, root deps via workspace:*, subpath-aware vitest aliases, tests import by package name | pnpm test 145 pass |
| 2026-10-18 | 7 | 575f9e28 | MV3 extension build: esbuild → apps/extension/dist, sha256 shim verified vs node crypto, manifest/icon emission; pnpm extension:build | node apps/extension/build.mjs |
| 2026-10-18 | 7 | 2959265c | README-AI-PROTECT.md → docs/ai-protect/README.md (+ index ref updated) | rg refs clean |
| 2026-10-18 | 8 | f165828d | Docs consolidation: root inventory docs → docs/, Qwen-era gateway/inference docs → docs/archive/, HANDOFF pruned to entry point + handoff-history.md | pnpm test + build green |
| 2026-10-18 | 9 | (docs) | Closeout: vitest 40 files/145 pass, build green, tsc 21 pre-existing errors, ops battery green today via docs/EVOLVING-TESTING-DOCUMENTATION.md; smoke:managed needs deployed :4445 (not running here) | this log |
