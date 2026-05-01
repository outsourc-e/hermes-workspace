# Hermes Workspace Naming Contract

This repo is for **Hermes Workspace** and **Hermes Agent** work.

## Canonical product names

Use these names in all new UI, docs, skills, prompts, tests, review comments, and handoffs:

- **Hermes Workspace**
- **Hermes Agent**
- **Swarm**
- **Hermes Kanban**
- **HERMES_HOME**
- `~/.hermes`

## Forbidden new references

Do **not** introduce these in new work unless quoting legacy history or compatibility behavior:

- Hermes Workspace
- Hermes Agent
- Claude swarm
- Claude-native paths
- `HERMES_HOME`
- `~/.hermes`

## Legacy compatibility rule

If older code, docs, tests, or handoffs contain Claude-era wording, treat it as legacy residue.

Default action:
- normalize it to Claude naming
- preserve old wording only when explicitly documenting migration or backwards compatibility

## Runtime/path rules

For Claude-native runtime work, prefer:

- `HERMES_HOME`
- `~/.hermes/profiles/<workerId>`
- `claude`
- Hermes worker sessions

Do not suggest Claude-specific runtime wrappers or profile paths for live Hermes Workspace behavior.

## Swarm/UI language rules

Prefer:
- **Ready** not person-specific hardcoded labels
- **Board / Cards / List** for reports views
- **Hermes Workspace** and **Hermes Agent** in update/config/status UI

Avoid:
- person-specific product labels baked into UI
- Claude-branded wording in Hermes Workspace surfaces

## Reviewer rule

Any PR or patch that introduces new Claude-branded naming into Hermes Workspace should be treated as a regression unless it is:
- a legacy compatibility note
- a migration guide
- a quoted historical artifact

## Agent instruction rule

When an agent is working in this repo:
- assume Claude naming is canonical
- rewrite Claude-era references to Claude by default
- do not invent Claude-branded paths, products, or wrapper guidance
- if uncertain, prefer repo-native Claude terminology over historical aliases
