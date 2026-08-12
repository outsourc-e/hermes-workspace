---
name: executing-plans
description: Execute an approved architect implementation plan with tests and checkpoints (developer lane).
version: 1.0.0
author: Hermes Workspace (adapted from superpowers)
metadata:
  hermes:
    tags: [swarm, developer, implementation, plans]
    category: software-development
---

# Executing Plans (Developer)

Use when implementing an **approved architect spec or plan** in the developer lane.

Announce: "Using executing-plans skill."

## Step 1: Load and review

1. Read the plan/spec from `memory/swarm/missions/<missionId>/architect/` or the dispatch task
2. Review critically — if scope, interfaces, or tests are unclear, **BLOCK** and escalate to architect
3. If clear: create todos and proceed

## Step 2: Execute

For each task:

1. Mark in progress
2. Follow spec exactly — no architecture changes
3. Run tests/build verifications specified in the plan
4. Mark complete with command output as proof

Use `test-driven-development` when the plan calls for new behavior.

## Step 3: Hand off

- Output structured checkpoint with `FILES_CHANGED`, `COMMANDS_RUN`, test results
- Request **architect** implementation review — do not self-approve design intent

## Stop when

- Spec gap blocks correct implementation
- Tests fail repeatedly
- Plan requires architecture change → escalate to architect, do not improvise

## Prohibited

- Skipping tests
- Expanding scope beyond approved plan
- Merging without greenlight
