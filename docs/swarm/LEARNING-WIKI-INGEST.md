# Learning → Wiki 知识摄入

> **Canonical source:** [`skills/swarm/learning-wiki-ingest/SKILL.md`](../../skills/swarm/learning-wiki-ingest/SKILL.md)  
> 本文档为人类可读摘要；执行时 learning worker 应加载 **skill**，而非仅读本文档。

## 快速调用

```bash
# 推荐：显式点名 skill + missionId
hermes -p learning chat -q "learning-wiki-ingest missionId=<missionId>"
```

未指定 `missionId` 时 skill **不会**自动 ingest 全部 mission，只会列出 `wikiIngest.status: pending` 的候选并返回 `NEEDS_INPUT`。批量需显式：`allPending=true`。

```bash
hermes -p learning chat -q "用 learning-wiki-ingest 将 mission research-vmc-1782283462 写入 wiki"
```

Orchestrator 派发时注明：`Skill: learning-wiki-ingest`，`Input: missionId=<id>`。

## 流程摘要

1. 读取 `memory/swarm/missions/<missionId>/manifest.json` 与各 worker 产物
2. 按 `llm-wiki` 规则定向 `$WIKI_PATH`（`SCHEMA.md` + `index.md` + `log.md`）
3. **复制**（不移动）来源到 `~/wiki/raw/`
4. 创建/更新 `concepts/`、`entities/` 页（摘要，非完整 spec）
5. 更新 `index.md`、`log.md`
6. 回写 `manifest.json` → `wikiIngest.status: done`
7. 输出 learning checkpoint

## 分层原则

| Wiki | Mission 归档 |
|------|--------------|
| 可复用结论、定义、决策摘要 | 完整 spec、调研、审查记录 |
| 带引用的关键事实 | handoff 运行时日志 |

## Greenlight

- 本地写入 `~/wiki`：无需 greenlight
- 对外发布（Obsidian Sync 等）：需 `publish` 人工批准

## 示例

WMPC mission 完整示例见 [`skills/swarm/learning-wiki-ingest/references/wmpc-example.md`](../../skills/swarm/learning-wiki-ingest/references/wmpc-example.md)。

## 相关

- [`memory/swarm/README.md`](../../memory/swarm/README.md) — 共享记忆布局
- [`llm-wiki`](../../skills/research/llm-wiki/SKILL.md) — wiki 规范（若已同步到 profile）
- [`AGENTS.md`](../../AGENTS.md) — 知识分层
