# Escalation Guide for All Agents

When 3 rounds of challenge-response fail to resolve a dispute between upstream and downstream agents on the canonical pipeline:

```text
orchestrator → researcher → architect → (developer | writer) → architect (review + harden) → learning
```

（`(developer | writer)` = 两条互斥 build lane；同一步骤只跑一个 executor。）

See also [HANDOFF-PROTOCOL.md](./HANDOFF-PROTOCOL.md). Human Gate UI/API remains as documented in `AGENTS.md` (LangGraph Phase 2).

## When to Escalate

- 3 rounds of challenge/response still unresolved
- A **blocking** known-unknown prevents the downstream worker from producing a valid checkpoint
- Greenlight-bound action needs an explicit human decision (orchestrator may escalate earlier)

## Escalation Flow

```text
Round 1: Downstream Challenge
    ↓
Round 2: Upstream Response
    ↓
Round 3: Downstream Final Challenge or Upstream Final Response
    ↓
Still unresolved?
    ↓
YES → Create Escalation File → Notify Orchestrator → STOP WORK
    ↓
Orchestrator reads escalation → Presents to user (Inbox / Human Gate) → User decides
    ↓
Decision recorded → Workers notified → Continue flow
```

## Escalation File Format

Save to: `output/{downstream-role}/escalations/{topic}-{id}.md`

Valid `{downstream-role}` values: `architect`, `developer`, `writer`, `learning` (rarely), or `orchestrator` if the control plane opens the file on behalf of a worker.

```markdown
# Escalation: [Topic]

## 争议双方
- **挑战方**: [downstream agent]
- **被挑战方**: [upstream agent]

## 争议内容
- **原始交付**: [link to upstream deliverable]
- **Challenge 文件**: [link to challenge]
- **Response 文件**: [link to response]

## 3 轮回顾
### Round 1
- 挑战: ...
- 回应: ...

### Round 2
- 挑战: ...
- 回应: ...

### Round 3
- 挑战: ...
- 回应: ...

## 核心分歧
[一句话描述争议焦点]

## 对下游工作的影响
[如果不解决，下游无法做什么]

## 建议的决策选项
1. [选项 A: 接受上游方案]
2. [选项 B: 接受下游要求]
3. [选项 C: 折中方案]

---
**需要人工决策**
```

## After Human Decision

Orchestrator records the decision and notifies both agents:

```markdown
# Decision Record: [Escalation ID]

## Decision
[What was decided]

## Rationale
[Why this decision]

## Action Items
- [Upstream agent]: [what to change]
- [Downstream agent]: [how to proceed]

## Recorded By
Orchestrator at [timestamp]
```

Preferred resume paths (unchanged):

- Dashboard `/swarm2` Human Gate：**继续执行** / **中止**
- CLI: `python -m hermes_langgraph_orchestrator --execute --resume approved|abort --mission-id <id>`
- API: `POST /api/orchestrator-resume` with `{ missionId, action }`

## Rules

1. **Must STOP work** after creating escalation — do not proceed with assumptions
2. **Must notify Orchestrator** explicitly — don't just save the file and wait
3. **Must record decision** — don't let it be forgotten
4. **Must update deliverables** after decision — reflect the resolution in outputs
5. Role boundaries still hold after resume (researcher≠strategy, developer≠architecture, writer≠facts)
