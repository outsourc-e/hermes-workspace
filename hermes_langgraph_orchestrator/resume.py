"""
Human gate helpers for the LangGraph Phase 2 orchestrator.

Provides:
- `build_resume_command`: construct a LangGraph Command from a paused state.
- `read_mission_state`: read the current paused state for a mission id.
- `resume_mission`: resume a paused mission with `approved` or `abort`.
"""

from __future__ import annotations

import dataclasses
import json
from dataclasses import asdict, is_dataclass
from typing import Any

from langgraph.types import Command

from .state import OrchestratorState


def _serialize(value: Any) -> Any:
    """Recursively serialize dataclasses/lists/dicts for JSON output."""
    if is_dataclass(value) and not isinstance(value, type):
        return {k: _serialize(v) for k, v in asdict(value).items()}
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(v) for v in value]
    if isinstance(value, set):
        return sorted(_serialize(v) for v in value)
    return value


def serialize_state(state: OrchestratorState) -> dict[str, Any]:
    """Return a JSON-serializable copy of an OrchestratorState dict."""
    return _serialize(state)


def build_human_gate_assignments(
    state: OrchestratorState,
    *,
    choice: str = "primary",
    human_note: str = "",
    target_worker_id: str | None = None,
) -> list[dict]:
    """Build dispatch assignments from a human-gate UI selection."""
    classifications = state.get("classifications", []) or []
    checkpoints = state.get("checkpoints", []) or []
    classification = classifications[0] if classifications else {}
    source_id = (
        classification.get("worker_id")
        if isinstance(classification, dict)
        else getattr(classification, "worker_id", "unknown")
    )
    cp_map = {cp.get("worker_id"): cp for cp in checkpoints if cp.get("worker_id")}
    checkpoint = cp_map.get(source_id, checkpoints[0] if checkpoints else {})

    if isinstance(classification, dict):
        blocker_summary = classification.get("blocker_summary") or checkpoint.get("blocker") or ""
        verdict = classification.get("verdict") or "BLOCKED"
    else:
        blocker_summary = classification.blocker_summary or checkpoint.get("blocker") or ""
        verdict = classification.verdict or "BLOCKED"

    target_id = (target_worker_id or source_id or "unknown").strip()
    mission_goal = state.get("mission_goal", "")
    note = (human_note or "").strip()
    result = (checkpoint.get("result") or "").strip()
    next_action = (checkpoint.get("next_action") or "").strip()
    files = (checkpoint.get("files_changed") or "").strip() or "none"

    note_block = f"\n\n## 人工补充说明\n{note}" if note else ""
    choice_label = {"primary": "选项一", "secondary": "选项二", "custom": "自定义"}.get(
        choice, choice
    )

    if target_id == source_id:
        task = (
            f"## Mission\n{mission_goal}\n\n"
            f"## Human gate 决策\n"
            f"人工选择：{choice_label}（重试 {source_id}）\n"
            f"上一 verdict：{verdict}\n"
            f"阻塞原因：{blocker_summary or 'unknown'}{note_block}\n\n"
            f"## Your task\n"
            f"根据人工决策继续处理阻塞项，完成后回报 checkpoint "
            f"(STATE, FILES_CHANGED, COMMANDS_RUN, RESULT, BLOCKER, NEXT_ACTION)。"
        )
        reason = f"human gate {choice_label}: retry {source_id}"
    else:
        context_lines = [
            f"## Mission\n{mission_goal}\n",
            f"## Human gate 决策\n",
            f"人工选择：{choice_label}（{source_id} → {target_id}）\n",
            f"上一 verdict：{verdict}\n",
            f"阻塞原因：{blocker_summary or 'unknown'}{note_block}\n",
            f"## Context from {source_id}\n",
        ]
        if result:
            context_lines.append(f"Result: {result}\n")
        if next_action:
            context_lines.append(f"Suggested next action: {next_action}\n")
        context_lines.append(f"Files changed: {files}\n")
        context_lines.extend(
            [
                f"\n## Your task\n",
                f"As {target_id}, act on the human gate decision above. ",
                "Address the blocker or handoff context, then return the required checkpoint format "
                "(STATE, FILES_CHANGED, COMMANDS_RUN, RESULT, BLOCKER, NEXT_ACTION).",
            ]
        )
        task = "".join(context_lines)
        reason = f"human gate {choice_label}: {source_id} → {target_id}"

    return [{"worker_id": target_id, "task": task, "reason": reason, "action": "human"}]


def build_resume_command(
    state: OrchestratorState,
    action: str,
    assignment_overrides: list[dict] | None = None,
    *,
    human_choice: str | None = None,
    human_note: str | None = None,
    target_worker_id: str | None = None,
) -> Command:
    """Build a LangGraph Command to resume from the human_approval interrupt.

    Args:
        state: The paused orchestrator state.
        action: Either ``approved`` or ``abort``.
        assignment_overrides: Optional replacement assignments for the human
            gate. If provided and ``action`` is ``approved``, these are used
            instead of ``pending_human_assignments``.
        human_choice: UI choice ``primary`` | ``secondary`` | ``custom``.
        human_note: Optional free-text from the human gate panel.
        target_worker_id: Target worker for the approved dispatch.
    """
    if action == "approved":
        if assignment_overrides is not None:
            pending = assignment_overrides
        elif human_choice or human_note or target_worker_id:
            pending = build_human_gate_assignments(
                state,
                choice=human_choice or "primary",
                human_note=human_note or "",
                target_worker_id=target_worker_id,
            )
        else:
            pending = state.get("pending_human_assignments", []) or []

        payload: dict[str, Any] | None = None
        if human_choice or human_note or target_worker_id:
            payload = {
                "choice": human_choice or "primary",
                "human_note": human_note or "",
                "target_worker_id": target_worker_id or "",
            }

        update: dict[str, Any] = {
            "langgraph_assignments": pending,
            "pending_human_assignments": [],
            "human_resume_action": "approved",
            "human_resume_payload": payload,
            "langgraph_needs_human": False,
        }
        analysis = ""
        decision = state.get("langgraph_decision")
        if isinstance(decision, dict):
            analysis = str(decision.get("analysis") or "")
        elif decision is not None and hasattr(decision, "analysis"):
            analysis = str(getattr(decision, "analysis", "") or "")
        if "review loop limit" in analysis and "architect" in analysis and "researcher" in analysis:
            counts = dict(state.get("transition_counts") or {})
            for key in list(counts.keys()):
                if "architect" in key and "researcher" in key:
                    counts[key] = 0
            update["transition_counts"] = counts

        return Command(update=update)
    if action == "abort":
        return Command(
            update={
                "pending_human_assignments": [],
                "langgraph_assignments": [],
                "human_resume_action": "abort",
                "awaiting_checkpoint": False,
            },
            goto="finalize_mission",
        )
    raise ValueError(f"Unsupported resume action: {action}")


async def read_mission_state(
    checkpoint_path: str,
    mission_id: str,
) -> dict[str, Any] | None:
    """Read the latest persisted LangGraph state for ``mission_id``.

    Returns a JSON-serializable dict, or ``None`` if no state exists.
    """
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    from .graph import build_phase2_graph

    config = {"configurable": {"thread_id": mission_id}}
    async with AsyncSqliteSaver.from_conn_string(checkpoint_path) as saver:
        graph = build_phase2_graph(checkpointer=saver)
        current = await graph.aget_state(config)
        if current is None or current.values is None:
            return None
        return serialize_state(current.values)


async def resume_mission(
    checkpoint_path: str,
    mission_id: str,
    action: str,
    assignment_overrides: list[dict] | None = None,
) -> OrchestratorState:
    """Resume a paused mission and return the final orchestrator state."""
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    from .graph import build_phase2_graph

    config = {"configurable": {"thread_id": mission_id}}
    async with AsyncSqliteSaver.from_conn_string(checkpoint_path) as saver:
        graph = build_phase2_graph(checkpointer=saver)
        current = await graph.aget_state(config)
        if current is None or current.values is None:
            raise ValueError(f"No paused state for mission {mission_id}")
        command = build_resume_command(current.values, action, assignment_overrides)
        return await graph.ainvoke(command, config)  # type: ignore[arg-type]


async def list_active_gates(
    checkpoint_path: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Scan the SQLite checkpointer for missions currently paused at human gate.

    Returns a list of JSON-serializable orchestrator states that have
    ``langgraph_needs_human=True`` and are not yet done, ordered by most
    recent checkpoint first.
    """
    import logging

    import aiosqlite
    from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

    # Silence non-fatal deserialization warnings while scanning.
    logging.getLogger("langgraph.checkpoint.serde.jsonplus").setLevel(logging.ERROR)

    serde = JsonPlusSerializer()
    gates: list[dict[str, Any]] = []

    async with aiosqlite.connect(checkpoint_path) as db:
        async with db.execute(
            """
            SELECT thread_id, MAX(checkpoint_id) AS max_id
            FROM checkpoints
            GROUP BY thread_id
            ORDER BY max_id DESC
            LIMIT ?
            """,
            (limit,),
        ) as cursor:
            threads = await cursor.fetchall()

        for thread_id, max_id in threads:
            async with db.execute(
                "SELECT type, checkpoint FROM checkpoints WHERE thread_id = ? AND checkpoint_id = ?",
                (thread_id, max_id),
            ) as cursor:
                row = await cursor.fetchone()
            if not row:
                continue
            type_, blob = row
            try:
                cp = serde.loads_typed((type_, blob))
            except Exception:
                continue
            values = cp.get("channel_values") or {}
            if values.get("langgraph_needs_human") and not values.get("all_done"):
                gates.append(serialize_state(values))

    return gates


def print_state_json(state: OrchestratorState | None) -> None:
    """Print a JSON-serializable state to stdout."""
    print(json.dumps(serialize_state(state) if state is not None else None, ensure_ascii=False, indent=2))


def print_gates_json(gates: list[dict[str, Any]]) -> None:
    """Print a list of active gates as JSON."""
    print(json.dumps(gates, ensure_ascii=False, indent=2))
