# WMPC Mission Wiki Ingest Example

Mission: `research-vmc-1782283462`

## Source files

| Role | Path |
|------|------|
| Manifest | `memory/swarm/missions/research-vmc-1782283462/manifest.json` |
| Research | `.../researcher/world-model-vmc-research.md` |
| Architecture | `.../architect/wmpc-architecture-spec.md` |
| Review | `.../architect/architect-review-of-researcher.md` |
| Retrospective | `.../learning/world-model-vmc-retrospective.md` |

## Planned wiki outputs

### Raw

- `~/wiki/raw/articles/world-model-vmc-research-2026-06.md` ← copy from researcher report

### Concepts (create or update)

- `~/wiki/concepts/world-model-predictive-control.md` — WMPC definition, MPC + learned dynamics
- `~/wiki/concepts/vehicle-motion-control.md` — VMC scope, WMPC integration point

### Frontmatter template (WMPC concept)

```yaml
---
title: World Model Predictive Control (WMPC)
created: 2026-06-25
updated: 2026-06-25
type: concept
tags: [concept, control, autonomous-driving]
sources: [raw/articles/world-model-vmc-research-2026-06.md]
confidence: medium
---
```

### Content outline

1. **Definition** — world model as MPC prediction engine (P(S_{t+1}|S_t, A_t))
2. **VMC context** — longitudinal/lateral/vertical coordination; ≤20ms control cycle constraint
3. **Verified facts** — cite arXiv IDs from approved research report only
4. **Open problems** — latency, physical plausibility, ASIL-D verification
5. **Related** — `[[vehicle-motion-control]]`, `[[model-predictive-control]]`

## Invoke

```bash
hermes -p learning chat -q "learning-wiki-ingest missionId=research-vmc-1782283462"
```
