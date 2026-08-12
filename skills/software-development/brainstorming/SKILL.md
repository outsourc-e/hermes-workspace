---
name: brainstorming
description: Use before technical design work — explore requirements and produce an approved architecture spec (architect lane; no implementation).
version: 1.0.0
author: Hermes Workspace (adapted from superpowers)
metadata:
  hermes:
    tags: [swarm, architect, design, brainstorming]
    category: software-development
---

# Brainstorming (Architect)

Turn upstream strategy into a **technical design** through dialogue and structured specs. For the **architect** worker only.

<HARD-GATE>
Do NOT write implementation code, scaffold projects, or dispatch developer tasks until a written technical spec exists and review is satisfied. Architect produces specs; developer implements.
</HARD-GATE>

## Process

1. **Explore context** — `memory/swarm/missions/`, wiki, existing code, prior architect artifacts
2. **Clarify** — one question at a time: constraints, interfaces, non-goals, success signals
3. **Propose 2–3 technical approaches** — trade-offs; recommend one with reasoning
4. **Present design** — architecture, data model, interfaces, kill criteria, milestones; get approval per section
5. **Write spec** — `memory/swarm/missions/<missionId>/architect/YYYY-MM-DD-<topic>-spec.md`
6. **Self-review** — no TBDs, no contradictions, scope fits one developer pass
7. **Hand off** — invoke `writing-plans` if an implementation plan is needed; route implementation to **developer**

## Anti-patterns

- Collecting primary market facts (researcher's job)
- "Simple change, skip design" — even small interface changes get a short spec
- Business strategy beyond technical scope

## Terminal state

Approved technical spec + optional implementation plan. **Not** merged code.
