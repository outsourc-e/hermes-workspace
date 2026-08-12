# Autoresearch 使用指导

本文是 **操作手册**。契约字段、反模式、示例 YAML 见 [AUTORESEARCH.md](./AUTORESEARCH.md)。

## 一键入口（对齐 Claude Code `/autoresearch`）

```bash
cd /path/to/hermes-workspace
bash scripts/sync-autoresearch-skills.sh   # 首次

# 空参数 / 自然语言 → wizard 问 Goal / 目标文件 / 指标 → 自动派发 executor
orchestrator:autoresearch chat

# 或直接一句话（plan 模式）
orchestrator:autoresearch chat -q "/autoresearch 提高 autoresearch-demo 的 routing hint 关键词分"

# 已有契约文件（contract 模式）
orchestrator:autoresearch chat -q "/autoresearch autoresearch-demo/contract.yaml"

# 内联 Metric/Verify（classic 模式）
orchestrator:autoresearch chat -q "Goal: reduce lint errors
Metric: eslint error count
Verify: pnpm exec eslint src --format json | jq '.[].errorCount' | awk '{s+=$1} END {print s}'
Guard: pnpm test
Iterations: 3"
```

Orchestrator 会：解析模式 → 写 `memory/swarm/orchestrator/<slug>-autoresearch.yaml` → 终端派发 `architect:autoresearch` 或 `developer:autoresearch` → 读 TSV 汇总。

**显式分步**（审计/CI）仍可用 `orchestrator:autoresearch-dispatch` + 手写 `contract.yaml`。

## 一句话

Autoresearch 不是「调研」，而是 **在锁定评测的前提下，对单一可写目标做小步修改 → 跑机械指标 → 变好就留、变差就回滚 → 记日志**，由 orchestrator 管契约与派发，architect/developer 执行循环。

```text
researcher:quick     建事实、写草稿，不跑 loop
orchestrator         写/验契约、greenlight、派发
architect:autoresearch   改规格/skill/提示词类目标
developer:autoresearch   改代码/测试类目标
```

## 什么时候用

**适合：**

- 有 **标量指标**（整数、通过率、lint 条数、延迟毫秒数等）
- 有 **可脚本化的 verify**（shell 输出一个数）
- 有 **guard**（测试/构建/体积上限等必须一直过）
- 每次只动 **一个 mutable_target**（一个 skill、一个路由 hint、一个模块）

**不适合：**

- 需要人主观打分（「写得更好」「策略更对」）
- 评测集/打分脚本本身可以被 loop 改掉（reward hacking）
- 涉及 merge、发布、删库、改密钥等（需单独 greenlight，一般不做 autoresearch）

拿不准时先用 `researcher:quick` 或 `architect:design`，不要硬上 loop。

## 角色分工

| 角色 | Wrapper | 做什么 |
|------|---------|--------|
| orchestrator | `orchestrator:autoresearch` | **默认入口**：wizard / plan / 跑契约 / 自动派发 |
| orchestrator | `orchestrator:autoresearch-dispatch` | 仅校验已有契约并派发（无 wizard） |
| researcher | `researcher:quick` | 供事实；可帮起草契约字段；**不执行 loop** |
| architect | `architect:autoresearch` | `executor: architect` 时执行 loop（规格类） |
| developer | `developer:autoresearch` | `executor: developer` 时执行 loop（代码类） |
| learning | `learning` | 任务结束后把结论写入 wiki |

## 环境准备（首次）

```bash
cd /path/to/hermes-workspace
bash scripts/sync-autoresearch-skills.sh
```

会安装三个 wrapper（`~/.local/bin/`）并把 skills 同步到 `~/.hermes/skills/swarm/`：

| Wrapper | 预加载 skills |
|---------|----------------|
| `orchestrator:autoresearch` | autoresearch-orchestrate, autoresearch-plan, autoresearch |
| `orchestrator:autoresearch-dispatch` | 同上（契约校验专用别名） |
| `architect:autoresearch` | autoresearch-execute, autoresearch |
| `developer:autoresearch` | autoresearch-execute, autoresearch |

> **注意：** wrapper 的 `-s` 只预加载 autoresearch 系列；`orchestrator-core`、`architect-core` 等由 profile 自带，不要写进 `-s`（否则会报 `Unknown skill`）。

## 标准流程（5 步）

### 1. 定义可机械评测的目标

写清：

- **改什么**（mutable_target）
- **不能改什么**（locked_eval：eval 脚本、guard、数据集、rubric）
- **怎么打分**（verify 命令 → 单个数字）
- **安全线**（guard 命令 → exit 0）
- **谁执行**（executor）

### 2. 写契约 `contract.yaml`

路径一律 **相对于仓库/workspace 根目录**，不要用 `hermes-workspace/` 前缀（在根目录执行时会路径双叠）。

最小模板：

```yaml
goal: <一句话可验证结果>
scope:
  - path/to/allowed/area
mutable_target: path/to/only/file/you/may/edit.md
locked_eval:
  - path/to/eval.sh
  - path/to/guard.sh
metric: <指标名与单位>
direction: higher   # 或 lower
verify: bash path/to/eval.sh
guard: bash path/to/guard.sh
iterations: 3
results_log: autoresearch-results/my-run.tsv
rollback: git checkout -- path/to/only/file/you/may/edit.md when metric worsens or guard fails
greenlight: approved — <范围说明，demo/试点/禁止 merge 等>
executor: architect   # 或 developer
```

### 3. Orchestrator 校验并派发

```bash
cd /path/to/hermes-workspace

orchestrator:autoresearch-dispatch chat -q \
  "Validate contract at <path>/contract.yaml. Dry-run verify and guard. Output DISPATCH checkpoint with EXECUTOR and dispatch command. Do not run the loop."
```

期望 checkpoint 含：`STATE: DISPATCHED`（或指出缺字段/路径问题）、`EXECUTOR: architect|developer`。

### 4. Executor 执行 loop

```bash
# 规格 / skill / 提示词
architect:autoresearch chat -q \
  "Execute autoresearch per <path>/contract.yaml. Log to results_log. End with STATE: DONE."

# 代码 / 测试
developer:autoresearch chat -q \
  "Execute autoresearch per <path>/contract.yaml. Log to results_log. End with STATE: DONE."
```

契约已 `greenlight: approved` 时可跳过 orchestrator，直接跑 executor（仅适合本地 pilot）。

### 5. 收尾

- 读 `results_log`（TSV）看 baseline → 最终 metric、keep/revert
- developer 跑完的，让 architect 做 design-intent / metric-hacking 审查
- 让 `learning` 把可复用结论写入 wiki

## 内置 Demo 走读

目录：`autoresearch-demo/`

| 文件 | 作用 |
|------|------|
| `contract.yaml` | 契约：`executor: architect`，2 轮迭代 |
| `routing_hint.md` | **唯一可改** 的研究员路由提示（mutable_target） |
| `eval.sh` | **锁定** 评分：统计 hint 里 4 组关键词命中数（0–4） |
| `guard.sh` | **锁定** 守卫：文件存在且 ≤600 字节 |
| `DISPATCH.md` | 本 demo 的命令速查 |

**eval 逻辑（简化）：** 每命中一组关键词 +1 分——`wiki`、`citation|source`、`uncertainty|confidence`、`no recommendation|no strategy`。

**一次成功 pilot 的效果：**

| 轮次 | metric | 做了什么 |
|------|--------|----------|
| 0 baseline | 1 | 只有「读 wiki」 |
| 1 keep | 2 | 加了 cite sources |
| 2 keep | 3 | 加了 uncertainty 提示 |

日志：`autoresearch-results/demo-pilot.tsv`。

复现：

```bash
cd /path/to/hermes-workspace
# 可选：把 routing_hint 重置为仅含 wiki 的一行，清空 TSV 表体
architect:autoresearch chat -q "Run autoresearch per autoresearch-demo/contract.yaml"
```

## 自己写一个 eval/guard

**eval.sh 原则：**

```bash
#!/usr/bin/env bash
set -euo pipefail
# 只读 mutable_target 和 locked 资源，不改文件
# 最后 echo 一个整数（或可被 awk 解析的单个数）
score=0
# ... 机械规则 ...
echo "$score"
```

**guard.sh 原则：**

```bash
#!/usr/bin/env bash
set -euo pipefail
# exit 0 = 通过；非 0 = 本轮回滚
test -f "$TARGET"
test "$(wc -c < "$TARGET")" -le 600
```

契约里 `verify` / `guard` 在派发前应由 orchestrator **干跑** 一次，确认能出数且 guard 行为符合预期。

## TSV 日志格式

```tsv
# metric_direction: higher
iteration	timestamp	commit	metric	delta	guard	guard-metric	status	description
0	...	abc123	1	0.0	pass	62	baseline	initial
1	...	def456	2	+1.0	pass	83	keep	added citation hint
```

- `keep` / `discard` / `crash` / `no-op` 都要记，失败回滚是正常证据链
- 不要删「变差」的行

## 选 executor

| 目标类型 | executor | 示例 |
|----------|----------|------|
| SKILL.md、SOUL.md、路由 hint、接口说明 | `architect` | `autoresearch-demo/routing_hint.md` |
| 应用代码、单测、构建脚本 | `developer` | 某个 `src/foo.ts`、eslint 违规数下降 |

边界模糊时：能写成「设计/规格变更」→ architect；必须改运行时代码 → developer。

## 常见问题

### `Unknown skill(s): orchestrator-core`

wrapper `-s` 里写了 profile core skill。解决：只保留 `autoresearch-*`，然后 `bash scripts/sync-autoresearch-skills.sh`。

### verify 路径找不到

契约路径相对 **当前工作目录**（一般在 workspace 根）。错误示例：

```yaml
verify: bash hermes-workspace/autoresearch-demo/eval.sh   # 在根目录执行会双叠
```

正确：

```yaml
verify: bash autoresearch-demo/eval.sh
```

### 指标不涨但文件一直在改

- eval 是否只读 locked 规则、mutable 改动是否真的影响计分
- direction 是否写反（higher vs lower）
- 是否一轮改太多（应一次一个可 falsify 的改动）

### 能不能让 researcher 跑 loop？

不能。researcher 只建事实；loop 归 orchestrator 派发后的 architect/developer。

## Pilot 与加长运行

默认 **先 pilot**：

1. `iterations: 2–3`，前台会话，不 background
2. 看 TSV 与 git log，确认没有改 eval/guard、没有 scope 外 diff
3. 再考虑加大 iterations 或 durable session

需要 merge/发布/长时后台 loop 时，orchestrator 必须显式 greenlight（`swarm.yaml` 里 `long-running-loop` 在 greenlight 列表中）。

## 延伸阅读

- [AUTORESEARCH.md](./AUTORESEARCH.md) — 完整契约、好/坏目标示例、exit report 模板
- `skills/swarm/autoresearch-orchestrate/references/orchestrator-routing.md` — 目标分型（来自 uditgoenka/autoresearch）
- `autoresearch-demo/DISPATCH.md` — demo 命令
- `swarm.yaml` — worker skills 与 mode 真源
