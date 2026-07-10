# Nova Build Notes

## Summary

- Created `feature/nova-skin` and committed the requested design artifacts, preview, idle video, and poster assets first.
- Reworked the Tailwind v4 theme surface through `src/scifi-theme.css` so `scifi` is now the default Nova dark room: navy-black surfaces, amber memory light, scoped utility classes, and dark-only Nova aliases.
- Reskinned the existing app shell instead of replacing routes: top bar, chat rail, dashboard, memory, tasks, cost analytics, onboarding/startup, empty states, connection banners, MCP, skills, settings, jobs, profiles, and mobile helper copy were kept in place and rethemed.
- Added `src/lib/nova-memory-adapter.ts` and wired the existing memory browser to show health, live recall/write activity, and scoped fragment cards while preserving the real file list/search/read/write workflow.
- Added `src/lib/nova-daily-check-adapter.ts` and `DailyCheckCard` to the existing dashboard. The overthinking tile uses stable sizing and wrapped labels so it does not truncate.
- Corrected preview-review items: visual link uses `public/nova-idle.mp4` with poster fallback, the old realtime model label is gone, `grok-4.3` is the visible default model fallback, `kimi-k2.6` appears only in fallback/cost context, memory has a live activity feed, and fragments show `default` / `bf-01` scope badges.

## Verification

- `pnpm build`: passed after the final changes.
- Targeted test `pnpm vitest run src/screens/chat/components/chat-composer-context-controls.test.ts`: passed after restoring the guarded workspace-context source strings.
- `pnpm lint`: repo-wide command still fails on pre-existing broad lint debt and generated/bundled files, including `electron/server-bundle.cjs`, e2e import ordering, server array-type/no-unnecessary-condition rules, and parser-project issues for JS files. I fixed the irregular-whitespace issues introduced by the text sweep.
- `pnpm test`: repo-wide command still fails in existing backend/store suites unrelated to the reskin, including kanban backend auto-detection, MCP preset/source store expectations, Windows path matching in swarm foundation, and older chat message-list expectations. The reskin-specific source-inspection failure was fixed and verified.

## Compromises

- I did not modify `src/server`, API route contracts, `.env`, package dependencies, or backend connection logic. Some API/server strings still contain upstream Hermes terminology because those surfaces are protocol/backend identifiers rather than Nova UI branding.
- `package.json` metadata still uses the historical package name because the brief forbade dependency/package churn and the app-facing manifest has been updated instead.
- `src/routeTree.gen.ts` was already modified in the worktree and remains uncommitted because it was unrelated to this build.

## Human Eyes

- Review the broad frontend copy sweep for any places where "Nova gateway" should instead remain a precise upstream/backend name.
- Check the running app at `http://localhost:3000` for the desired amount of Nova character presence across the deeper settings/onboarding surfaces.
