# Swarm Handoff Protocol

Canonical pipeline for Hermes Workspace (fused from `feature/mychange` protocols onto the main roster):

```text
orchestrator → researcher → architect → (developer | writer) → architect (review + harden) → learning
```

`(developer | writer)` 是两条互斥 **build lane**（代码 / 内容）。architect 选定 `executor: developer | writer`，同一步骤不得并行双派发；若代码与内容都需要，按序再开一轮（通常先 developer 再 writer）。详见 `AGENTS.md` Executor lane rule。

Dispatch still goes through `POST /api/swarm-dispatch` (see [DISPATCH-GUIDE.md](./DISPATCH-GUIDE.md)). This document defines **what each stage may produce**, **what it must not do**, and **how challenges escalate**.

Related: [ESCALATION-GUIDE.md](./ESCALATION-GUIDE.md) · [LEARNING-WIKI-INGEST.md](./LEARNING-WIKI-INGEST.md) · [AUTORESEARCH-GUIDE.md](./AUTORESEARCH-GUIDE.md)

---

## 协作原则

1. **Orchestrator** 只做分解、路由、greenlight、续跑；不写事实报告、不做架构、不写产品代码。
2. **Researcher** 只输出事实与来源，不做策略判断或推荐方案。
3. **Architect** 同时承担「方向决策（wedge / bets / kill criteria）」、「技术/内容规格」与 **executor lane 选择**；不采集一手事实、不写应用实现/受众成稿（autoresearch 契约内除外）。
4. **Developer** 只在 `executor: developer` 时实现与验证代码；不改架构、不做内容叙事决策。
5. **Writer** 只在 `executor: writer` 时产出受众向内容/视觉交付物；不改架构、不改已确立事实。
6. **Learning** 只做复盘与 wiki 摄入；不重新做调研、设计或实现。
7. **下游有权质疑上游，上游必须回应**；质疑-回应最多 **3 轮**（review retry Gate C 亦 ≤3，见 `AGENTS.md`）。
8. **3 轮未解决** → 标记为「已知未知」→ 按 [ESCALATION-GUIDE.md](./ESCALATION-GUIDE.md) 上报 Orchestrator → 人工决策后再继续。

---

## 链路概览

```text
                    Orchestrator (route / greenlight)
                              │
                              ▼
                         Researcher
                              │  (facts only)
                              ▼
                          Architect
              (direction + spec + executor lane)
                              │
              executor: developer | writer（互斥）
                     ┌────────┴────────┐
                     ▼                 ▼
                 Developer           Writer
              (code + tests)   (content / visual)
                     └────────┬────────┘
                              ▼
                    Architect (intent review + harden)
                              │
                              ▼
                           Learning
                      (retro + wiki ingest)
```

---

## 链路 0: Orchestrator → Researcher / Architect / …

### 职责

- 把用户意图拆成带 proof contract 的 assignment
- 选择 worker、记录 mission、等待 checkpoint
- 在 greenlight 边界停住（merge / publish / destructive / external-send / credential-change / long-running-loop）
- 续跑、repair、或把 blocker 送 Inbox / Human Gate

### 输出

- SwarmBrief / mission assignments（经 `/api/swarm-dispatch` 或 LangGraph）
- 不落「事实报告」或「技术规格」正文（那些属于下游）

---

## 链路 1: Researcher → Architect

### 输入

- Orchestrator 的调研 brief

### 输出路径

```text
hermes-workspace/output/researcher/{topic}-report.md
```

### 输出格式

```markdown
# Research Report: [Topic]

## Executive Summary
- Research question:
- Confidence level (high/medium/low):
- Key unknowns:

## Facts Established

### [Category 1]
- **Fact**: [statement]
  - **Source**: [URL / paper / document path]
  - **Verification method**: [how you confirmed]
  - **Confidence**: [high/medium/low]
  - **Limitations**: [what you couldn't verify]

## Claims Requiring Validation
- [Claim]: [why uncertain, what would confirm/refute]

## Sources
| Source | Type | URL/Path | Accessed |
|--------|------|----------|----------|

## Data Quality Assessment
- **Completeness**: ...
- **Recency**: ...
- **Bias risk**: ...

---
**Researcher checkpoint**: This report contains facts only. No strategic recommendations.
```

### 质量检查清单

- [ ] 每个非显而易见的事实都有来源
- [ ] 置信度明确标注（high/medium/low）
- [ ] **没有策略建议**（没有 "we should" / "the best option is"）
- [ ] 矛盾事实被明确标出

### Architect 消费方式

Architect **不得**把 researcher 报告当结论直接转发。必须做**决策 + 技术转化**：

| Researcher 说 | Architect 应该输出 |
|---|---|
| 「竞品 A 用 WebRTC」 | 「是否采用 WebRTC 的 wedge/假设 + 接口与模块边界」 |
| 「儿童语音识别准确率约 X%」 | 「对 MVP 范围与 kill criteria 的影响」 |
| 「来源冲突」 | 「known unknown + 需要人工/再调研的点」 |

---

## 链路 2: Architect → Developer + Writer

Architect 在本链路合并了分支策略里的 **Strategist（方向）** 与 **Designer（技术规格）**，避免再引入额外 profile。必须显式写出：

```text
executor: developer | writer
```

### 输入

- Researcher 事实报告
- Orchestrator 的设计 / 内容 brief

### 输出路径

```text
hermes-workspace/output/architect/{topic}-strategy.md   # 方向：wedge / bets / kill criteria
hermes-workspace/output/architect/{topic}-spec.md       # 技术规格（executor: developer）
hermes-workspace/output/architect/{topic}-content-brief.md  # 内容规格（executor: writer）
```

可合并为一份文档的不同章节；但 **当前步骤只派发一个 executor**，对应消费面必须清晰。

### 方向文档格式（strategy）

```markdown
# Strategy / Direction: [Topic]

## Problem Framing
- Core problem / Constraints / Success criteria:

## Recommended Wedge
- Who / What / Why now:

## Assumption Stack
| ID | Assumption | Validation Method | Priority |
|----|------------|-------------------|----------|

## Kill Criteria
| ID | Criterion | Measurement | Threshold |
|----|-----------|-------------|-----------|

## Phased Milestones
### Phase 0: …
- Goal / Deliverables / Handoff to: developer | writer | researcher

## Known Unknowns
- …

## Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|

---
**Architect strategy checkpoint**: Decisions and bets only. Facts cited from researcher report.
```

### 技术规格格式（spec → developer）

```markdown
# Technical Specification: [Topic]

## Overview
- Strategy source / Design goal / Scope:

## Architecture
[diagram or description]

## Data Model / API Interface
…

## Module Breakdown
| Module | Responsibility | Input | Output | Dependencies |
|--------|----------------|-------|--------|--------------|

## Technology Stack
| Layer | Choice | Rationale | Alternatives Rejected |
|-------|--------|-----------|----------------------|

## Implementation Order
1. …

## Testing Strategy
- Unit / Integration / Browser smoke:

## Open Questions
- …

---
**Architect spec checkpoint**: Implementable technical design. No application code.
```

### 内容规格格式（content-brief → writer）

```markdown
# Content Brief: [Topic]

## Audience & Intent
## Tone / Brand / Accessibility constraints
## Deliverable types (slides / HTML / doc / script / social)
## Structure outline
## Must-cite facts (from researcher)
## Out of scope

---
**Architect content checkpoint**: Audience-ready structure only. No final copy polish required here.
```

### 质量检查清单

- [ ] 关键事实可追溯到 researcher 报告；缺事实则退回 researcher，不自行补造
- [ ] 每个重要 bet 有 kill criterion
- [ ] spec 足够让 developer 无需猜接口
- [ ] content-brief 足够让 writer 无需改架构或事实
- [ ] **没有应用实现代码**（留给 developer）
- [ ] **没有最终受众成稿**（留给 writer）

### Developer / Writer 消费方式

| Architect 输出 | Developer / Writer 输出 |
|---|---|
| Module / API 定义 | 实现 + 测试 + build/browser proof |
| Content brief + 必引事实 | 幻灯片 / HTML / 文案 / 脚本等成稿 |
| Open question | Challenge 回 architect，不自行改架构 |

---

## 链路 3a: Developer → Architect (review)

### 输入

- `output/architect/{topic}-spec.md`（及 strategy 中与实现相关的约束）

### 输出路径

```text
hermes-workspace/output/developer/{topic}-*
```

### Checkpoint 期望

- `STATE` / `FILES_CHANGED` / `COMMANDS_RUN` / `RESULT` / `BLOCKER` / `NEXT_ACTION`
- 测试与（如适用）browser smoke 证据
- **不**改架构；规格缺口 → challenge architect

### Architect review

- 核对 design-intent fidelity
- 通过 → 若还需要内容交付，architect 再开 `executor: writer`；否则进入 harden / learning
- 不通过 → `REVIEW_OUTCOME: changes_requested` 退回同一 executor（≤3）；耗尽则 Human Gate

---

## 链路 3b: Writer → Architect (review)

### 输入

- `output/architect/{topic}-content-brief.md`
- 相关 researcher 事实（只引用，不改写事实含义）

### 输出路径

```text
hermes-workspace/output/writer/{topic}-*
```

### Checkpoint 期望

- 交付物路径、格式、受众
- 可访问性 / 品牌约束已核对
- 事实引用可回溯；缺口 → challenge architect（或经 orchestrator 退回 researcher）

### Architect review

- 核对 audience-intent 与事实一致性
- publish / external-send 仍走 greenlight

---

## 链路 4: Architect (reviewed) → Learning

### 输入

- mission 下 researcher / architect / developer / writer 产物与 checkpoint
- `memory/swarm/missions/<missionId>/manifest.json`

### 动作

1. 复盘：教训、决策摘要、未解决问题
2. 按 [LEARNING-WIKI-INGEST.md](./LEARNING-WIKI-INGEST.md) / `learning-wiki-ingest` 摄入可复用结论到 `$WIKI_PATH`
3. **复制**而非移动 mission 归档

### 禁止

- 重新做一手调研、重写架构、补写产品代码或对外发布稿

---

## 质疑-反馈机制

### Challenge 格式

```markdown
## Challenge to [Upstream]: [Topic]

- **Location in deliverable**: [section/link]
- **Claim being challenged**: [exact quote]
- **Your concern**: [why unreliable / unimplementable / inconsistent]
- **What you need**: [clarification / re-verification / redesign]
- **Impact on your work**: [this blocks X]
- **Priority**: [blocking / nice-to-have]
```

### 质疑路径

| 下游 | 可质疑上游 | 质疑文件路径 |
|------|-----------|-------------|
| Architect | Researcher | `output/architect/challenges/{fact-id}.md` |
| Developer | Architect | `output/developer/challenges/{spec-id}.md` |
| Writer | Architect | `output/writer/challenges/{brief-id}.md` |
| Learning | Architect / Orchestrator | `output/learning/challenges/{mission-id}.md`（仅限摄入冲突 / 归档缺失） |

Writer 若发现**事实**错误，经 architect 退回 researcher，不自己改事实层。

### 回应格式

```markdown
## Challenge Response: [Topic]

- **Original claim**: ...
- **Challenger concern**: ...
- **Re-verification / Redesign**: ...
- **Updated output**: ...
- **Limitations**: ...
```

### 升级规则

```text
Round 1: 下游 Challenge
    ↓
Round 2: 上游 Response
    ↓
Round 3: 下游终轮 Challenge 或上游终轮补充
    ↓
仍未解决？ → known unknown → Escalation 文件 → Orchestrator → 人工决策
```

详见 [ESCALATION-GUIDE.md](./ESCALATION-GUIDE.md)。

---

## Autoresearch 旁路

有界优化环（`architect:autoresearch` / `developer:autoresearch` / `writer:autoresearch`）由 **Orchestrator** 按 [AUTORESEARCH-GUIDE.md](./AUTORESEARCH-GUIDE.md) 派发，不替代上述主链路的事实→规格→实现/内容→复盘顺序。executor 仍受同一角色禁止项约束。
