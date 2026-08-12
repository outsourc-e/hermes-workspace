"""
Workflow-aware mock services for LangGraph orchestration tests.

Used by ``--mock-services`` to exercise routing, human gates, and review loops
without a live Workspace or tmux workers. Checkpoints are synthesized from the
active workflow YAML plus an optional mock profile.
"""

from __future__ import annotations

from typing import Literal

from .state import OrchestratorState, WorkerCheckpoint, WorkerClassification
from .workflow import WorkflowSpec, load_default_workflow, load_workflow, resolve_workflow_path

# ``cdc`` is a deprecated alias for ``blocked_once`` (kept for CLI/scripts).
MockProfile = Literal["auto", "generic", "blocked_once", "cdc", "human_gate"]

DEFAULT_ROSTER = ["orchestrator", "researcher", "architect", "developer", "writer", "learning"]


def _checkpoint(
    worker_id: str,
    *,
    state: str = "DONE",
    result: str = "",
    blocker: str = "",
    next_action: str = "mock next",
    review_outcome: str = "",
    files_changed: str = "",
    commands_run: str = "",
    raw: str | None = None,
) -> dict[str, str]:
    if not result:
        result = f"[mock] {worker_id} {state.lower()}"
    if raw is None:
        lines = [f"STATE: {state}", f"RESULT: {result}"]
        if files_changed:
            lines.append(f"FILES_CHANGED: {files_changed}")
        if review_outcome:
            lines.append(f"REVIEW_OUTCOME: {review_outcome}")
        if blocker:
            lines.append(f"BLOCKER: {blocker}")
        lines.append(f"NEXT_ACTION: {next_action}")
        raw = "\n".join(lines)
    return {
        "worker_id": worker_id,
        "state": state,
        "result": result,
        "files_changed": files_changed,
        "commands_run": commands_run,
        "blocker": blocker,
        "next_action": next_action,
        "review_outcome": review_outcome,
        "raw": raw,
    }


def _is_review_gate(workflow: WorkflowSpec, worker_id: str) -> bool:
    """Return True if the workflow expects this worker to act as a review gate.

    A review gate exists when the worker has at least one terminal-approved
    transition. The presence of a changes_requested transition is optional;
    if absent, any non-approval result falls through to the human gate.
    """
    return any(
        t.from_worker == worker_id and t.on.review_outcome == "approved"
        for t in workflow.transitions
    )


def _workflow_requires_harden(workflow: WorkflowSpec) -> bool:
    return any(
        t.on.review_outcome == "approved" and "harden_outcome" in t.on.metadata
        for t in workflow.transitions
    )


def _review_loop_max(workflow: WorkflowSpec, worker_id: str) -> int | None:
    """Return the max_iterations for the review loop targeting this worker."""
    for transition in workflow.transitions:
        if (
            transition.to == worker_id
            and transition.on.verdict == "DONE"
            and transition.max_iterations is not None
        ):
            return transition.max_iterations
    return None


def _has_design_lane(workflow: WorkflowSpec, worker_id: str) -> bool:
    return any(
        t.from_worker == worker_id
        and t.on.verdict == "DONE"
        and not t.on.review_outcome
        and t.to in ("developer", "writer")
        for t in workflow.transitions
    )


def _get_first_delivery_target(workflow: WorkflowSpec, worker_id: str) -> str:
    """Return the first non-review DONE target for an architect-like worker."""
    for t in workflow.transitions:
        if (
            t.from_worker == worker_id
            and t.on.verdict == "DONE"
            and not t.on.review_outcome
            and t.to
        ):
            return t.to
    return "developer"


def resolve_mock_profile(workflow: WorkflowSpec, profile: str = "auto") -> MockProfile:
    del workflow  # auto no longer keys off deleted CDC workflow names
    normalized = (profile or "auto").strip().lower()
    if normalized == "cdc":
        return "blocked_once"
    if normalized in ("generic", "blocked_once", "human_gate"):
        return normalized  # type: ignore[return-value]
    return "generic"


def build_mock_checkpoint(
    worker_id: str,
    call: int,
    *,
    workflow: WorkflowSpec,
    profile: MockProfile,
    transition_counts: dict[str, int] | None = None,
    mission_goal: str = "",
) -> dict[str, str]:
    counts = transition_counts or {}
    goal_hint = (mission_goal or workflow.name)[:80]
    resolved = resolve_mock_profile(workflow, profile)

    if resolved == "blocked_once":
        return _build_blocked_once_checkpoint(worker_id, call, workflow)

    if resolved == "human_gate" and worker_id == "architect" and _is_review_gate(workflow, worker_id):
        return _checkpoint(
            worker_id,
            result=f"[mock human_gate] adversarial review round {call} — still disputed",
            review_outcome="changes_requested",
            next_action="researcher revises",
        )

    if worker_id == "architect" and _is_review_gate(workflow, worker_id):
        loop_max = _review_loop_max(workflow, worker_id) or 3
        delivery_rounds = max(
            counts.get("architect→developer", 0),
            counts.get("architect→writer", 0),
        )
        if call == 1 and _has_design_lane(workflow, worker_id):
            target = _get_first_delivery_target(workflow, worker_id)
            # Include DELIVERABLE_TYPE hint so the generic mock can route to writer
            # when the first typed transition points to writer.
            raw_lines = [
                "STATE: DONE",
                f"RESULT: [mock] design complete for {goal_hint}",
                f"DELIVERABLE_TYPE: {'visual' if target == 'writer' else 'code'}",
                f"NEXT_ACTION: {target} implements",
            ]
            return _checkpoint(
                worker_id,
                result=f"[mock] design complete for {goal_hint}",
                next_action=f"{target} implements",
                raw="\n".join(raw_lines),
            )
        if delivery_rounds >= loop_max - 1 or call >= 2:
            raw_lines = [
                "STATE: DONE",
                "RESULT: [mock] review approved",
                "REVIEW_OUTCOME: approved",
                "NEXT_ACTION: terminal",
            ]
            if _workflow_requires_harden(workflow):
                raw_lines.insert(3, "HARDEN_OUTCOME: pass")
            return _checkpoint(
                worker_id,
                result="[mock] review approved",
                review_outcome="approved",
                next_action="terminal",
                raw="\n".join(raw_lines),
            )
        return _checkpoint(
            worker_id,
            result=f"[mock] review round {call} — changes requested",
            review_outcome="changes_requested",
            next_action="address review feedback",
        )

    if worker_id == "researcher":
        return _checkpoint(
            worker_id,
            result=f"[mock] research complete: {goal_hint}",
            next_action="submit for review",
        )

    if worker_id == "learning":
        return _checkpoint(
            worker_id,
            result="[mock] retrospective documentation complete",
            next_action="none",
        )

    return _checkpoint(worker_id, result=f"[mock] {worker_id} step {call} done")


def _build_blocked_once_checkpoint(
    worker_id: str, call: int, workflow: WorkflowSpec
) -> dict[str, str]:
    """Developer first call BLOCKED → human gate; second call DONE (Gate C/H friendly)."""
    if worker_id == "researcher":
        return _checkpoint(
            worker_id,
            result="[mock] research complete",
            next_action="交给 architect 设计",
        )
    if worker_id == "architect":
        if call >= 2:
            raw_lines = [
                "STATE: DONE",
                "RESULT: [approved] final review passed",
                "REVIEW_OUTCOME: approved",
                "NEXT_ACTION: 任务完成",
            ]
            if _workflow_requires_harden(workflow):
                raw_lines.insert(3, "HARDEN_OUTCOME: pass")
            return _checkpoint(
                worker_id,
                result="[approved] final review passed",
                review_outcome="approved",
                next_action="任务完成",
                raw="\n".join(raw_lines),
            )
        return _checkpoint(
            worker_id,
            result="设计完成",
            files_changed="docs/design/architecture.md",
            next_action="developer 实现",
        )
    if worker_id == "developer":
        if call >= 2:
            return _checkpoint(
                worker_id,
                result="实现完成，测试通过",
                next_action="交给 architect 最终审查",
            )
        return _checkpoint(
            worker_id,
            state="BLOCKED",
            result="实现阻塞：需要架构决策",
            blocker="实现阻塞：需要架构决策",
            next_action="需要 architect 决定",
        )
    return _checkpoint(worker_id)


def _load_workflow_from_state(state: OrchestratorState) -> WorkflowSpec:
    spec = state.get("workflow_spec")
    if spec is not None:
        return spec
    workflow_path = state.get("workflow_path")
    if workflow_path:
        return load_workflow(resolve_workflow_path(str(workflow_path)))
    return load_default_workflow()


def _mock_classify_checkpoint(
    cp: WorkerCheckpoint, checkpoints: list[WorkerCheckpoint], state: OrchestratorState
) -> WorkerClassification:
    from .nodes import _infer_architect_review_outcome, _try_rule_classify

    ruled = _try_rule_classify(cp)
    if ruled:
        return _infer_architect_review_outcome(ruled, checkpoints, state)

    wid = cp["worker_id"]
    label = cp["state"]
    review = (cp.get("review_outcome") or "").strip()
    if wid == "developer" and label == "BLOCKED":
        return WorkerClassification(
            wid,
            "BLOCKED",
            "architecture_decision",
            cp.get("blocker", ""),
            "mock classify",
            "",
        )
    return WorkerClassification(wid, label, "", "", "mock classify", review)


def make_mock_init_mission(mock_profile: str = "auto"):
    async def _fn(state: OrchestratorState) -> dict:
        workflow_spec = _load_workflow_from_state(state)
        assignments = state.get("langgraph_assignments", []) or []
        if not assignments:
            assignments = [
                {
                    "worker_id": workflow_spec.entry,
                    "task": state.get("mission_goal", ""),
                    "reason": f"workflow entry: {workflow_spec.entry}",
                }
            ]
        profile = resolve_mock_profile(workflow_spec, mock_profile)
        print(f"[mock-init] workflow={workflow_spec.name}, profile={profile}, entry={workflow_spec.entry}")
        return {
            "roster_snapshot": sorted(DEFAULT_ROSTER),
            "workflow_spec": workflow_spec,
            "terminal_docs_enabled": workflow_spec.settings.terminal_docs,
            "max_iterations": workflow_spec.settings.max_iterations,
            "langgraph_assignments": assignments,
            "log_entries": [
                f"[mock-init] workflow={workflow_spec.name}, profile={profile}, roster={len(DEFAULT_ROSTER)}"
            ],
        }

    return _fn


def make_mock_ensure_sessions():
    async def _fn(state: OrchestratorState) -> dict:
        workers = sorted(
            {a["worker_id"] for a in state.get("langgraph_assignments", []) if a.get("worker_id")}
        )
        print(f"[mock-ensure] {workers}")
        return {"log_entries": [f"[mock-ensure] {', '.join(workers)}"]}

    return _fn


def make_mock_dispatch(mock_profile: str = "auto"):
    async def _fn(state: OrchestratorState) -> dict:
        assignments = state.get("langgraph_assignments", []) or []
        if not assignments:
            return {
                "dispatch_results": None,
                "checkpoints": [],
                "dispatch_error": None,
                "log_entries": ["[mock-dispatch] 无 assignments"],
            }

        workflow_spec = _load_workflow_from_state(state)
        profile = resolve_mock_profile(workflow_spec, mock_profile)
        dispatch_counts = dict(state.get("dispatch_counts", {}) or {})
        transition_counts = dict(state.get("transition_counts", {}) or {})
        checkpoints: list[WorkerCheckpoint] = []

        for assignment in assignments:
            wid = assignment["worker_id"]
            call = dispatch_counts.get(wid, 0) + 1
            cp = build_mock_checkpoint(
                wid,
                call,
                workflow=workflow_spec,
                profile=profile,
                transition_counts=transition_counts,
                mission_goal=state.get("mission_goal", ""),
            )
            checkpoints.append(WorkerCheckpoint(**cp))  # type: ignore[typeddict-item]
            dispatch_counts[wid] = call

        print(
            f"[mock-dispatch] profile={profile}, workflow={workflow_spec.name}, "
            f"{len(checkpoints)} checkpoints"
        )
        return {
            "dispatch_results": {"results": []},
            "checkpoints": checkpoints,
            "dispatch_error": None,
            "dispatch_counts": dispatch_counts,
            "log_entries": [f"[mock-dispatch] {len(checkpoints)} checkpoints"],
        }

    return _fn


def make_mock_classify():
    async def _fn(state: OrchestratorState) -> dict:
        checkpoints = state.get("checkpoints", []) or []
        if not checkpoints:
            return {"classifications": [], "log_entries": ["[mock-classify] 无 checkpoint"]}

        classifications = [
            _mock_classify_checkpoint(cp, checkpoints, state) for cp in checkpoints
        ]
        summary = ", ".join(
            f"{c.worker_id}={c.verdict}/{c.review_outcome or '-'}" for c in classifications
        )
        print(f"[mock-classify] {summary}")
        return {
            "classifications": classifications,
            "log_entries": [f"[mock-classify] {summary}"],
        }

    return _fn
