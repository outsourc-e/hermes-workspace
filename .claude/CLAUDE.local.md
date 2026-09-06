# Hermes Workspace — Unified Dashboard Extension

## Task

Extend the existing Hermes Workspace dashboard with new data source widgets: Whoop health, CliniTrack project health, and daily digest summary.

## Key Files (READ FIRST)

- `src/server/dashboard-aggregator.ts` — existing aggregation pattern (pluggable fetcher, safeJson, section normalizers, Promise.all parallel fetch)
- `src/routes/api/dashboard/overview.ts` — existing API route that calls the aggregator
- `src/screens/dashboard/dashboard-screen.tsx` — existing dashboard UI (GlassCard layout, hero metrics band)
- `src/screens/dashboard/components/hero-metrics.tsx` — hero tile component with sparklines
- `src/screens/dashboard/components/ops-strip.tsx` — ops strip (DO NOT MODIFY)

## Architecture Pattern

1. New API routes in `src/routes/api/` using `createServerFn`
2. Each route reads its data source and returns typed JSON
3. Dashboard aggregator fetches from new routes in `Promise.all`
4. New sections added to `DashboardOverview` type
5. Dashboard screen renders new sections as hero tiles / GlassCards

## Data Sources

- Whoop: `/root/.hermes/repos/nw-personal-projects/whoop/latest.json`
- Digests: `/root/.hermes/repos/nw-personal-projects/digests/` (latest file)
- CliniTrack: SSH to `nick-weiland-oc381816@100.64.45.20`, key `/root/.ssh/home_pc_ed25519`, path `/home/nick-weiland-oc381816/Projects/Praxentis/active/CliniTrack`

## Rules

- NEVER modify existing components (ops-strip, hero-metrics, dashboard-screen layout)
- NEVER change the existing dashboard aggregator structure
- Always report plan before implementing
- Always confirm before modifying existing files
