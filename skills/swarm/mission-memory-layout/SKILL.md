---
name: mission-memory-layout
description: Swarm shared memory layout — missions archive, handoffs bus, wiki promotion path.
version: 1.0.0
author: Hermes Workspace
metadata:
  hermes:
    tags: [swarm, memory, missions, handoffs]
    category: swarm
---

# Mission Memory Layout

Shared swarm artifacts use a **three-layer** layout under the workspace `memory/` tree.

## Paths

| Layer | Path | Owner |
|-------|------|-------|
| Handoff bus | `memory/handoffs/swarm/<worker>-latest.{md,json}` | Platform / orchestrator |
| Mission archive | `memory/swarm/missions/<missionId>/<worker>/` | All workers (per assignment) |
| Draft (no missionId yet) | `memory/swarm/<worker>/` | Individual worker |
| Durable knowledge | `$WIKI_PATH` (`~/wiki`) | learning via `llm-wiki` |

## Write rules

1. **Dispatch includes `missionId`** → write to `memory/swarm/missions/<missionId>/<your-worker-id>/`
2. **On mission complete** → ensure `manifest.json` exists; set `status: archived`
3. **Handoffs** → only latest pointers in `memory/handoffs/swarm/`; do not store long specs there
4. **Wiki promotion** → learning only; invoke `learning-wiki-ingest` skill (orchestrator: `Skill: learning-wiki-ingest missionId=<id>`)

## Read rules (brain-first)

1. `memory/swarm/missions/<missionId>/manifest.json`
2. `memory/handoffs/swarm/<upstream-worker>-latest.md`
3. `grep -r` under `memory/swarm/missions/`
4. `$WIKI_PATH` via `llm-wiki`

## manifest.json (minimal)

```json
{
  "missionId": "...",
  "title": "...",
  "status": "active | archived",
  "artifacts": { "researcher": { "file.md": "description" } },
  "wikiIngest": { "status": "pending | done", "skill": "learning-wiki-ingest" }
}
```

Full convention: `memory/swarm/README.md`.
