"""
LangGraph Orchestrator State — workflow-driven swarm execution.
"""

from typing import TypedDict, Annotated, Any
from dataclasses import dataclass, field
import operator


def _merge_checkpoints(existing, new):
    """Merge checkpoint lists by worker_id, with newer values overriding older ones."""
    if not existing:
        existing = []
    if not new:
        new = []
    merged = {cp["worker_id"]: cp for cp in existing}
    for cp in new:
        wid = cp.get("worker_id")
        if wid:
            merged[wid] = cp
    return list(merged.values())


class WorkerCheckpoint(TypedDict):
    worker_id: str
    state: str
    result: str
    files_changed: str
    commands_run: str
    blocker: str
    next_action: str
    review_outcome: str
    raw: str


@dataclass
class WorkerClassification:
    worker_id: str
    verdict: str           # DONE | BLOCKED | NEEDS_INPUT | HANDOFF | SKIP
    blocker_type: str      # missing_dependency | test_failure | timeout | architecture_decision | missing_credential | unknown | ""
    blocker_summary: str
    reasoning: str
    review_outcome: str    # "" | "approved" | "changes_requested" — 仅 architect 审查 developer 实现时有效
    metadata: dict = field(default_factory=dict)


@dataclass
class DispatchDecision:
    source: str
    analysis: str
    assignments: list[dict]
    human_approval_required: bool
    metadata: dict = field(default_factory=dict)


class OrchestratorState(TypedDict, total=False):
    # --- 输入 ---
    mission_id: str
    mission_goal: str
    swarm_api_url: str
    thread_id: str

    # --- roster / workflow ---
    roster_snapshot: list[str]
    workflow_path: str | None
    workflow_spec: Any  # WorkflowSpec loaded from YAML
    terminal_docs_enabled: bool

    # --- 收集 ---
    checkpoints: list[WorkerCheckpoint] | None
    terminal_checkpoints: Annotated[list[WorkerCheckpoint] | None, _merge_checkpoints]
    collection_error: str | None

    # --- LangGraph 编排 ---
    classifications: list[WorkerClassification] | None
    langgraph_assignments: list[dict]
    langgraph_needs_human: bool
    langgraph_decision: DispatchDecision | None
    dispatched_workers: list[str]
    active_worker: str | None
    pending_assignments: list[dict]
    pending_human_assignments: list[dict]
    dispatch_counts: dict[str, int]
    transition_counts: dict[str, int]
    awaiting_checkpoint: bool

    # --- 执行状态 ---
    dispatch_results: dict | None
    dispatch_error: str | None
    wait_attempts: int
    all_done: bool

    # --- 控制 ---
    iteration: int
    max_iterations: int
    phase: str

    # --- human gate ---
    human_resume_action: str | None
    human_resume_payload: dict | None

    # --- 日志 ---
    log_entries: Annotated[list[str], operator.add]
