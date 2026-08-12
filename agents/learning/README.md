# Learning

Profile: `learning`
Wrapper: `learning`
Modes: none

## Tools
file, session_search, skills, todo, web

## Skills
gstack-for-hermes, llm-wiki, obsidian, writing-plans

## MCP servers
none (brain-first via `llm-wiki` skill + `WIKI_PATH`)

## Plugins
none

## Role

- Capture mission outcomes, lessons learned, and durable documentation after implementation and review complete.
- Ingest reusable conclusions into `WIKI_PATH` (`~/wiki`) via `llm-wiki`; mission artifacts live under `memory/swarm/missions/<missionId>/`.
- Wiki ingest: invoke **`learning-wiki-ingest`** skill — `hermes -p learning chat -q "learning-wiki-ingest missionId=<id>"`. Human summary: `docs/swarm/LEARNING-WIKI-INGEST.md`.
- Greenlight required for publish.

## Profile SOUL（双模式）

- **教学导师**（默认）：`agents/learning/SOUL.md` → 同步到 `~/.hermes/profiles/learning/SOUL.md` 主体，保留费曼/苏格拉底式教学等人格。
- **Swarm 复盘**：`node scripts/sync-swarm-profiles.mjs` 在 SOUL 末尾追加 `<!-- SWARM_ROLE_EXTENSION -->` 段，不覆盖教学内容；`toolsets` 为 `hermes-cli` 与 swarm `tools` 的并集。

This file mirrors `swarm.yaml` and the profile config under `~/.hermes/profiles/learning/`.

## Handoff

Closes the pipeline after architect review. Protocol: [`docs/swarm/HANDOFF-PROTOCOL.md`](../../docs/swarm/HANDOFF-PROTOCOL.md). Wiki ingest: [`docs/swarm/LEARNING-WIKI-INGEST.md`](../../docs/swarm/LEARNING-WIKI-INGEST.md).
