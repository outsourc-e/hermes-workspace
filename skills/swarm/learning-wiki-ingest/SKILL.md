---
name: learning-wiki-ingest
description: >-
  Ingest archived swarm mission knowledge into WIKI_PATH via llm-wiki. Activate when
  learning should promote mission conclusions to the wiki, user says "wiki ingest" /
  "写入 wiki" / "摄入知识库", manifest wikiIngest.status is pending, or orchestrator
  dispatches a retrospective with missionId. Requires missionId. Pairs with llm-wiki.
version: 1.1.0
author: Hermes Workspace
metadata:
  hermes:
    tags: [swarm, learning, wiki, llm-wiki, ingest, mission]
    category: swarm
    related_skills: [llm-wiki, mission-memory-layout, obsidian]
---

# Learning Wiki Ingest

Promote **reusable conclusions** from an archived mission (`memory/swarm/missions/<missionId>/`) into `$WIKI_PATH` (`~/wiki`). Full specs stay in the mission archive.

**Requires:** `llm-wiki` skill (wiki conventions, frontmatter, index/log).

## When This Skill Activates

- Orchestrator or user dispatches learning with a `missionId` after mission archive
- User: "把 mission X 写入 wiki"、"wiki ingest"、"摄入知识库"
- `manifest.json` → `wikiIngest.status: "pending"`
- Retrospective complete and durable knowledge capture is the next step

## Invocation

### Direct (learning worker)

```bash
hermes -p learning chat -q "learning-wiki-ingest missionId=research-vmc-1782283462"
```

```bash
hermes -p learning chat -q "用 learning-wiki-ingest 将 mission research-vmc-1782283462 的可复用结论写入 wiki"
```

### Orchestrator dispatch snippet

```text
Worker: learning
Skill: learning-wiki-ingest
Input: missionId=<id>
Note: publish greenlight required before external distribution
```

### Parameters

| Param | Required | Default |
|-------|----------|---------|
| `missionId` | **yes** | — |
| `allPending` | no | `false` — never implicit; only when user explicitly requests batch |
| `dryRun` | no | `false` — orient + plan only, no wiki writes |
| `skipRawCopy` | no | `false` — set true if raw already ingested |

Mission root: `memory/swarm/missions/<missionId>/`

## Missing `missionId` (fail-safe)

**Do not ingest any mission** until `missionId` is resolved. No implicit batch.

1. Scan `memory/swarm/missions/*/manifest.json` for candidates where:
   - `status: archived` AND `wikiIngest.status: pending` (or field absent)
2. Emit checkpoint **`STATE: NEEDS_INPUT`** with a numbered list:

   ```text
   Pending wiki ingest candidates:
   1. research-vmc-1782283462 — 世界模型 VMC / WMPC
   ```

3. Ask user (or orchestrator) to pick **one** `missionId`, or to pass `allPending=true` for explicit batch.
4. **Prohibited without explicit opt-in:**
   - Ingesting every mission under `memory/swarm/missions/`
   - Ingesting missions with `wikiIngest.status: done`
   - Ingesting flat files under `memory/swarm/missions/*.md` (no manifest)

### Explicit batch (`allPending=true`)

Only when user says e.g. "ingest all pending missions" / "把所有 pending 的 mission 写入 wiki":

1. List all pending archived missions (same scan as above).
2. If count > 1, confirm scope in checkpoint before writes (or `dryRun=true` first).
3. Process **sequentially**, one mission per ingest pass — update each `manifest.json` before starting the next.
4. Never parallel-write to `$WIKI/index.md` or `log.md`.

If zero candidates: `STATE: DONE` + `RESULT: No pending missions for wiki ingest`.

## Preconditions (stop if unmet)

| Check | Action if fail |
|-------|----------------|
| `memory/swarm/missions/<missionId>/manifest.json` exists | `STATE: BLOCKED` — create manifest first |
| `manifest.status` is `archived` (or user explicitly overrides) | warn; proceed only if user confirms |
| `$WIKI/SCHEMA.md`, `index.md`, `log.md` exist | run `llm-wiki` init or `STATE: BLOCKED` |
| `wikiIngest.status` is not already `done` | skip unless user requests re-ingest |

```bash
WIKI="${WIKI_PATH:-$HOME/wiki}"
MISSION="memory/swarm/missions/<missionId>"
```

## What goes where

| → Wiki (`concepts/`, `entities/`, `comparisons/`) | → Stay in mission archive |
|---------------------------------------------------|---------------------------|
| Approved design **summaries** | Full `*-architecture-spec.md` |
| Definitions, terminology, trade-offs | Raw research reports |
| Cross-mission lessons learned | Review diffs, handoff terminal logs |
| Cited facts (high/medium confidence) | `*-latest.json` runtime noise |

Follow `llm-wiki` Page Thresholds in `$WIKI/SCHEMA.md` — no pages for passing mentions.

## Procedure (execute in order)

### 1. Orient

① Read `$WIKI/SCHEMA.md`, `$WIKI/index.md`, last 30 lines of `$WIKI/log.md` (llm-wiki resume rules).

② Read `$MISSION/manifest.json`.

③ Read mission artifacts in pipeline order:

- `learning/*-retrospective.md` (if present)
- `researcher/*.md` (facts)
- `architect/*.md` — **approved** specs/reviews only (check handoff `reviewOutcome: approved`)

④ `search_files` / grep `$WIKI` for existing pages on the same topic — update, don't duplicate.

If `dryRun=true`: output planned pages + raw copies; stop before writes.

### 2. Archive raw sources (Layer 1)

Copy (never move) primary sources to `$WIKI/raw/articles/` or `raw/papers/`:

```bash
cp "$MISSION/researcher/<report>.md" "$WIKI/raw/articles/<slug>.md"
```

Prepend raw frontmatter:

```yaml
---
source_url: file://memory/swarm/missions/<missionId>/researcher/<report>.md
ingested: YYYY-MM-DD
mission_id: <missionId>
---
```

`raw/` is immutable after write — corrections go in wiki pages only.

### 3. Write wiki pages (Layer 2)

Use **`llm-wiki` ingest rules** for each page:

- Required YAML frontmatter: `title`, `created`, `updated`, `type`, `tags`, `sources`
- Set `confidence: medium` unless multi-source corroboration
- Minimum 2 outbound `[[wikilinks]]` per new page
- Tags must exist in `$WIKI/SCHEMA.md` taxonomy (add to SCHEMA first if needed)

Suggested page types from a typical mission:

| Source | Wiki target |
|--------|-------------|
| Research report | `concepts/<topic>.md` |
| Architecture spec | `concepts/<system>.md` (summary only) |
| Retrospective lessons | append to existing concept pages or `queries/<mission>-lessons.md` |

WMPC example: `references/wmpc-example.md`

### 4. Update navigation

① Add new/updated pages to `$WIKI/index.md` (correct section, one-line summary).

② Bump index header `Last updated` and `Total pages`.

③ Append to `$WIKI/log.md`:

```markdown
## [YYYY-MM-DD] ingest | <mission title> (<missionId>)
- raw/articles/<file>.md (copied)
- concepts/<page>.md (created|updated)
- source: memory/swarm/missions/<missionId>/
```

### 5. Update manifest

Edit `$MISSION/manifest.json`:

```json
"wikiIngest": {
  "status": "done",
  "ingestedAt": "YYYY-MM-DD",
  "wikiPages": ["concepts/example.md"],
  "rawSources": ["raw/articles/example.md"]
}
```

Do **not** delete or relocate mission archive files.

### 6. Verify

```bash
grep "<missionId>" "$WIKI/log.md"
grep "<page-slug>" "$WIKI/index.md"
```

Optional: run `llm-wiki` lint (orphans, broken links, index completeness).

### 7. Checkpoint

```text
STATE: DONE
FILES_CHANGED:
  - $WIKI/raw/articles/...
  - $WIKI/concepts/...
  - $WIKI/index.md
  - $WIKI/log.md
  - memory/swarm/missions/<missionId>/manifest.json
COMMANDS_RUN: ...
RESULT:
  Wiki ingest complete for <missionId>.
  Created: ...
  Updated: ...
  Mission archive unchanged.
BLOCKER: none | awaiting publish greenlight
NEXT_ACTION: none
```

## Greenlight

| Action | Greenlight |
|--------|------------|
| Write wiki pages locally | none |
| Update manifest | none |
| External publish (Obsidian Sync, team share) | `publish` — human approval per `swarm.yaml` |

If publish not yet approved: complete ingest, set `BLOCKER: awaiting publish greenlight`.

## Prohibited

- Ingesting without a resolved `missionId` (except explicit `allPending=true` batch)
- Moving or deleting mission archive files
- Copying full architecture specs into wiki (summaries only)
- Creating wiki pages without cross-links
- Modifying files in `$WIKI/raw/` after initial write
- External publish without greenlight

## Related

- `llm-wiki` — wiki schema, ingest, lint
- `mission-memory-layout` — mission paths and manifest
- `references/wmpc-example.md` — worked example for `research-vmc-1782283462`
