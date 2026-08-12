# Swarm Model 配置统一化

> **状态：已落地**。模型以 `swarm.yaml` + Hermes `config.yaml` 为准；文档勿再硬编码具体 model id。

## 背景问题（已解决）

原先存在四套独立的模型信息源，新增模型需改 TypeScript 源码：

| 源 | 位置 | 问题 |
|---|---|---|
| 1 | `~/.hermes/config.yaml` | provider 定义（api_key、base_url）+ model 段 — **保留，作为唯一定义源** |
| 2 | `swarm-model-resolver.ts` | 硬编码翻译表（`"GPT-5.5"` → `{provider, default}`）— **已删除** |
| 3 | `swarm.yaml` | 仅存人类可读标签（`model: GPT-5.5`）— **已改为 `provider/model-id`** |
| 4 | `operational-worker-card.tsx` | `MODEL_OPTIONS` 硬编码数组 + `formatAssignedModel()` 反向翻译 — **已改为动态读取** |

## 目标

1. `swarm.yaml` 的 `model` 字段使用 `provider/model-id` 格式，引用 `config.yaml` 中已定义的 provider
2. 删除 `swarm-model-resolver.ts` 的硬编码映射表
3. Swarm Compose UI 模型下拉框从 `/api/models` 动态读取，选中后写入 `swarm.yaml`
4. 删除 UI 中的 `MODEL_OPTIONS` 硬编码数组
5. 新增模型只需改 `config.yaml`，UI 下拉框自动出现新模型

## 实现状态

| 项 | 状态 | 说明 |
|---|---|---|
| `swarm-model-resolver.ts` 简化 | ✅ | `parseSwarmModelLabel` + 辅助函数 `toSwarmModelKey` / `resolveSwarmModelKey` |
| `swarm-tmux-start.ts` 调用方更新 | ✅ | 使用 `parseSwarmModelLabel` |
| `swarm-dispatch.ts` model 同步 | ✅ | `ensureLiveTmuxSession` 在启动 tmux 前调用 `syncSwarmProfileModel` |
| `PATCH /api/swarm-roster` | ✅ | `src/routes/api/swarm-roster.ts`；dev 模式另有 `vite.config.ts` 中间件绕过 SSR hang |
| `operational-worker-card.tsx` 动态下拉 | ✅ | 从 `availableModels` prop 渲染；保存时 PATCH `swarm.yaml` |
| `swarm2-screen.tsx` 传递模型列表 | ✅ | `fetchAvailableModels()` → `availableModels` prop |
| `swarm.yaml` 全量迁移 | ✅ | worker `model` 均为 `provider/model-id`（见 `swarm.yaml`） |
| 测试更新 | ✅ | `swarm-model-resolver.test.ts` 覆盖解析与 key 构建 |
| PATCH 时同步 profile config | ⚠️ 部分 | dev 中间件会同步；`patchSwarmRosterWorker` 服务端函数仅写 `swarm.yaml` |

### `swarm.yaml` 模型格式

Worker `model` 必须是 `provider/model-id`（勿在 `AGENTS.md` 等文档中再抄一份）。当前示例：

```yaml
model: deepseek/deepseek-v4-pro
model: minimaxai/minimax-m2.7
model: custom:my-gateway/some-model-id   # provider 可含冒号
```

## 核心模块

### 1. `parseSwarmModelLabel` — roster → profile 解析

文件：`src/server/swarm-model-resolver.ts`

按**第一个 `/`** 拆分，provider 可含 `:`（如 `custom:my-gateway`），model id 可含额外 `/`（如 `deepseek-ai/deepseek-v4-pro`）：

```typescript
export function parseSwarmModelLabel(label: string | null | undefined): ResolvedSwarmModel | null {
  if (!label) return null
  const trimmed = label.trim()
  if (!trimmed) return null

  const slashIdx = trimmed.indexOf('/')
  if (slashIdx <= 0) return null
  return {
    provider: trimmed.slice(0, slashIdx),
    default: trimmed.slice(slashIdx + 1),
  }
}
```

legacy 人类可读标签（`GPT-5.5`、`Opus 4.7` 等）不再解析，返回 `null`。

### 2. UI key 构建 — `/api/models` → `swarm.yaml`

`/api/models` 返回 `{ id, name, provider }`，其中 `id` 常为 upstream model id（可能自带 org 前缀）。辅助函数负责拼出写入 `swarm.yaml` 的 canonical key：

| 函数 | 用途 |
|---|---|
| `toSwarmModelKey(provider, modelId)` | 拼接 `provider/modelId`，避免重复前缀（如 `minimaxai/minimaxai/...`） |
| `swarmModelKeyFromOption(m)` | 从 `/api/models` 条目生成 key |
| `resolveSwarmModelKey(model, provider, options?)` | 将 roster 中的 legacy 裸 id 或已有 key 解析为 canonical key（依赖 `availableModels` 匹配） |

### 3. `operational-worker-card.tsx` — 动态下拉 + 持久化

- **下拉框**：`availableModels.map(m => swarmModelKeyFromOption(m))` 作为 value，显示 `{provider} / {name}`
- **显示**：`formatAssignedModel()` 保留为薄包装，内部调用 `resolveSwarmModelKey`（不再硬编码翻译表）
- **保存**：`PATCH /api/swarm-roster` 写入 `{ workerId, patch: { model } }`；同时更新 localStorage 的 `modelLabel` 用于 UI 覆盖显示
- **响应解析**：使用 `res.text()` + `JSON.parse` 规避 dev 模式下 `res.json()` hang 问题

### 4. `PATCH /api/swarm-roster`

**路由**：`src/routes/api/swarm-roster.ts`

```typescript
PATCH: async ({ request }) => {
  const { workerId, patch } = await request.json()
  const roster = patchSwarmRosterWorker(workerId, patch, ids)
  return json({ ok: true, roster, savedAt: Date.now() })
}
```

**Dev 绕过**：`vite.config.ts` 中间件在 PATCH 时直接读写 `swarm.yaml`，并在 `patch.model` 变更时同步 worker profile 的 `config.yaml`（`model.provider` + `model.default`）。生产路径（TanStack handler / Electron bundle）目前仅写 `swarm.yaml`；profile 同步依赖后续 tmux 启动或 dispatch 时的 `syncSwarmProfileModel`。

### 5. 运行时 model 同步

两处确保 profile `config.yaml` 与 roster 一致：

| 调用点 | 时机 |
|---|---|
| `swarm-tmux-start.ts` | 启动 tmux session 前 |
| `swarm-dispatch.ts` `ensureLiveTmuxSession` | 自动创建 tmux session 前 |

```typescript
const resolved = parseSwarmModelLabel(roster?.model ?? null)
if (resolved) syncSwarmProfileModel(profilePath, resolved)
```

## 数据流

```
config.yaml                     swarm.yaml                    UI
─────────────                   ──────────                    ──
providers:                      workers:                      下拉框
  deepseek:                       - id: developer               deepseek/deepseek-v4-pro
    api_key: sk-xxx                 model: deepseek/...         minimaxai/minimax-m2.7
    base_url: ...                                               custom:my-gateway/...
  openai-codex:                                                    ↑
    ...                         parseSwarmModelLabel()    从 /api/models 动态读取
                                     ↓                    swarmModelKeyFromOption()
                            { provider, default }                  ↓
                                     ↓                    PATCH /api/swarm-roster
                          syncSwarmProfileModel()                  ↓
                                     ↓                         swarm.yaml
                          profile config.yaml
                            model:
                              provider: deepseek
                              default: deepseek-v4-pro
```

## 新增模型流程

```
改后（已实现）：
  ① 改 config.yaml（加 provider / model）
  ② 在 Swarm Compose UI 下拉框选择 → PATCH 写入 swarm.yaml
  ✅ 无需改源码、无需重新构建

改前（已废弃）：
  ① config.yaml  ② swarm-model-resolver.ts  ③ MODEL_OPTIONS  ④ swarm.yaml 标签  ⑤ 重新构建
```

## 不改的部分

- `~/.hermes/config.yaml` 的 `providers:` 段 — provider 唯一定义源
- `/api/models` 端点 — 从 config.yaml + gateway + 本地发现合并
- `syncSwarmProfileModel` — 逻辑不变，输入来源从硬编码翻译表变为 `parseSwarmModelLabel`
- `ensureSwarmProfileConfig` — 逻辑不变

## 遗留改进（可选）

1. **统一 PATCH profile 同步**：将 `vite.config.ts` 中的 profile 同步逻辑提取到 `patchSwarmRosterWorker` 或共享 helper，使生产路径与 dev 行为一致
2. **合并 `formatAssignedModel`**：`swarm2-screen.tsx` 仍有简化版（直接显示 `model` 字符串）；可统一使用 `resolveSwarmModelKey` 获得一致显示
3. **Electron bundle 重建**：`electron/server-bundle.cjs` 可能仍含旧版 `resolveSwarmModelLabel` / `MODEL_OPTIONS`，需重新打包
4. **文档**：勿在 `AGENTS.md` / README 硬编码具体 model id；只指向 `swarm.yaml`

## 相关文件

| 文件 | 职责 |
|---|---|
| `src/server/swarm-model-resolver.ts` | 解析 + key 构建 |
| `src/server/swarm-model-resolver.test.ts` | 单元测试 |
| `src/routes/api/swarm-roster.ts` | GET / POST / PATCH roster |
| `src/server/swarm-roster.ts` | `readSwarmRoster` / `patchSwarmRosterWorker` |
| `src/routes/api/swarm-dispatch.ts` | dispatch 时 model 同步 |
| `src/routes/api/swarm-tmux-start.ts` | tmux 启动时 model 同步 |
| `src/routes/api/models.ts` | 模型列表 API |
| `src/screens/swarm2/operational-worker-card.tsx` | Worker 卡片模型下拉 |
| `src/screens/swarm2/swarm2-screen.tsx` | 获取并传递 `availableModels` |
| `vite.config.ts` | dev PATCH 绕过 + profile 同步 |
| `swarm.yaml` | roster 源文件 |
