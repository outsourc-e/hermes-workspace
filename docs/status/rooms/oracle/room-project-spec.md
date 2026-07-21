# Oracle of Signals — Room Project Spec

**Room ID:** `oracle-signals`
**Status:** room-project-packet / local scaffolding
**Owner agent:** Oracle
**Safety mode:** read-only / dry-run / draft-only only
**Signal scoring:** temporary until stable signal-scoring service is approved

## Purpose

The Oracle gathers keyword, tag, trend, and demand signals from the local Product Intelligence DB and turns them into reviewable SEO intelligence for Agora and Forge.

## Stations

| Station ID | Name | Kind | Accepts |
|---|---|---|---|
| `oracle-research` | Signal Telescope | connector | research-request, artifact-handoff |
| `oracle-metrics` | Metrics Atelier | archive | artifact-handoff |

## Data contract

- `OracleSignal` — keyword or tag signal with temporary signal score.
- `OracleSignalKind` — keyword, tag, trend, competitor, demand, shop-stat.
- `OracleSignalStatus` — intake → scoring → verified → attached-to-opportunity → archived/rejected.
- `scoreOracleKeyword()` — temporary heuristic; weights are explicit and replaceable.
- `createOracleKeywordSignal()` / `attachOracleSignalToOpportunity()` — factory helpers.
- `buildOracleSignalBoard()` — read-only board grouped by kind and strength.

## Agents

| Agent ID | Display name | Role | Home station | Profile |
|---|---|---|---|---|
| `agent-oracle` | Oracle | signal-oracle | oracle-research | chatgptheavy |
| `agent-trend-scribe-1` | Trend Scribe | trend-scribe | oracle-metrics | workerkimi |
| `agent-keyword-cartographer-1` | Keyword Cartographer | keyword-cartographer | oracle-research | workerkimi |

## Read-only connector

- `product-intelligence-connector` via `GET /api/product-intelligence`
- Mode: `read-only`
- Purpose: read keyword/tag rows and keyword-edge graph for signal scoring

## Outputs

- `src/screens/war-room/v1/room-projects/oracle/`
- `public/war-room/v42-connected-ops/oracle/manifest.json`
- Consumed by integration cards later; does not edit shared hot files.

## Safety locks

- `externalActionsEnabled: false`
- `liveEtsyEnabled: false`
- No live search or marketplace side effects.
- Strong signals are still recommendations; DLV approval gate required before Forge action.
