"""
LangGraph Orchestrator Graph — workflow-driven execution loop.

START → init → ensure → dispatch → wait → classify → route → [human | finalize | dispatch]
"""

from datetime import datetime, timezone

from langgraph.graph import StateGraph, START, END
from langgraph.graph.state import CompiledStateGraph
from langgraph.checkpoint.memory import MemorySaver

from .state import OrchestratorState
from .nodes import (
    classify_workers,
    route_workflow,
    init_mission,
    ensure_sessions,
    dispatch_assignments,
    wait_for_checkpoints,
    human_approval_node,
    finalize_mission,
)


def _route_after_init(state: OrchestratorState) -> str:
    """If init failed (e.g. roster API unreachable), stop immediately."""
    return "init_error" if state.get("collection_error") else "continue"


async def _init_error_node(state: OrchestratorState) -> dict:
    error = state.get("collection_error", "unknown init error")
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] [init_error] {error}")
    return {
        "log_entries": [f"[init_error] {error}"],
        "all_done": True,
    }


def build_phase2_graph(
    classify_fn=None,
    init_fn=None,
    ensure_fn=None,
    dispatch_fn=None,
    checkpointer=None,
) -> CompiledStateGraph:
    """Deterministic LangGraph loop with workflow-driven routing."""
    graph = StateGraph(OrchestratorState)

    graph.add_node("init", init_fn if init_fn else init_mission)  # type: ignore[arg-type]
    graph.add_node("init_error", _init_error_node)  # type: ignore[arg-type]
    graph.add_node("ensure_sessions", ensure_fn if ensure_fn else ensure_sessions)  # type: ignore[arg-type]
    graph.add_node("dispatch_assignments", dispatch_fn if dispatch_fn else dispatch_assignments)  # type: ignore[arg-type]
    graph.add_node("wait_for_checkpoints", wait_for_checkpoints)  # type: ignore[arg-type]
    graph.add_node("classify", classify_fn if classify_fn else classify_workers)  # type: ignore[arg-type]
    graph.add_node("route", route_workflow)  # type: ignore[arg-type]
    graph.add_node("human_approval", human_approval_node)  # type: ignore[arg-type]
    graph.add_node("finalize_mission", finalize_mission)  # type: ignore[arg-type]

    graph.add_edge(START, "init")
    graph.add_conditional_edges(
        "init",
        _route_after_init,
        {"init_error": "init_error", "continue": "ensure_sessions"},
    )
    graph.add_edge("init_error", END)
    graph.add_conditional_edges(
        "ensure_sessions",
        _route_after_init,
        {"init_error": "init_error", "continue": "dispatch_assignments"},
    )
    graph.add_edge("dispatch_assignments", "wait_for_checkpoints")
    graph.add_edge("wait_for_checkpoints", "classify")
    graph.add_edge("classify", "route")

    def route_after_route(state: OrchestratorState) -> str:
        if state.get("all_done", False):
            return "finalize_mission"
        if state.get("langgraph_needs_human", False):
            return "human_approval"
        if state.get("awaiting_checkpoint", False):
            return "wait_for_checkpoints"
        # 有 assignments 时优先派发，避免 side-effect 已发生但状态被截断
        assignments = state.get("langgraph_assignments") or []
        if assignments:
            return "ensure_sessions"
        iteration = state.get("iteration", 0)
        max_iter = state.get("max_iterations", 5)
        if iteration >= max_iter:
            return "finalize_mission"
        return "ensure_sessions"

    def route_after_human_approval(state: OrchestratorState) -> str:
        if state.get("all_done", False) or state.get("human_resume_action") == "abort":
            return "finalize_mission"
        return "ensure_sessions"

    graph.add_conditional_edges(
        "route",
        route_after_route,
        {
            "human_approval": "human_approval",
            "finalize_mission": "finalize_mission",
            "ensure_sessions": "ensure_sessions",
            "wait_for_checkpoints": "wait_for_checkpoints",
        },
    )

    graph.add_conditional_edges(
        "human_approval",
        route_after_human_approval,
        {
            "finalize_mission": "finalize_mission",
            "ensure_sessions": "ensure_sessions",
        },
    )
    graph.add_edge("finalize_mission", END)

    saver = checkpointer if checkpointer is not None else MemorySaver()
    return graph.compile(
        checkpointer=saver,
        interrupt_before=["human_approval"],
    )


phase2_graph = build_phase2_graph()
