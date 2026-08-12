#!/usr/bin/env python3
"""
LangGraph Orchestrator — workflow-driven swarm execution.

用法:
    python -m hermes_langgraph_orchestrator --execute --mission-id <id> --goal "..."

    python -m hermes_langgraph_orchestrator --execute --mock-services --mission-id radw-mock-001
    python -m hermes_langgraph_orchestrator --execute --mock-services --workflow research_only --mock-profile human_gate

    python -m hermes_langgraph_orchestrator --execute --resume approved --mission-id <id>
    python -m hermes_langgraph_orchestrator --execute --resume abort --mission-id <id>
"""

import argparse
import asyncio
import os
import sys
import time
import warnings
import logging

# LangGraph checkpoints serialize custom dataclasses via msgpack and warn about
# unregistered modules. The state objects are under our control, so silence the
# non-fatal warning in CLI output.
warnings.filterwarnings(
    "ignore",
    message="Deserializing unregistered type .* from checkpoint",
    category=UserWarning,
)
logging.getLogger("langgraph.checkpoint.serde.jsonplus").setLevel(logging.ERROR)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langgraph.types import Command

from hermes_langgraph_orchestrator.resume import (
    build_resume_command,
    list_active_gates,
    print_gates_json,
    print_state_json,
    read_mission_state,
)
from hermes_langgraph_orchestrator.state import (
    OrchestratorState,
    WorkerCheckpoint,
    WorkerClassification,
)
from hermes_langgraph_orchestrator.workflow import load_workflow


def import_async_sqlite_saver():
    """Load AsyncSqliteSaver or exit with an actionable venv hint."""
    try:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        return AsyncSqliteSaver
    except ModuleNotFoundError:
        orch_dir = os.path.dirname(os.path.abspath(__file__))
        venv_python = os.path.join(orch_dir, ".venv", "bin", "python")
        print(
            "\n❌ 缺少 langgraph-checkpoint-sqlite（`langgraph.checkpoint.sqlite`）。\n"
            "   请用项目 venv 运行（--execute / --resume / --get-state），例如：\n"
            f"   {venv_python} -m hermes_langgraph_orchestrator --execute --resume approved --mission-id <id>\n"
            "\n   若尚未创建 venv：\n"
            f"   cd {os.path.dirname(orch_dir)} && python3 -m venv hermes_langgraph_orchestrator/.venv\n"
            f"   {venv_python} -m pip install -r hermes_langgraph_orchestrator/requirements.txt\n"
        )
        sys.exit(1)

# ============================================================
# CLI
# ============================================================
async def main():
    parser = argparse.ArgumentParser(description="LangGraph Orchestrator")
    parser.add_argument("--execute", action="store_true", help="运行 LangGraph 编排（必须，除非 --get-state / --list-active-gates）")
    parser.add_argument("--mock-services", action="store_true", help="mock init/ensure/dispatch（用于 CI/无 API 环境）")
    parser.add_argument(
        "--mock-profile",
        type=str,
        default="auto",
        choices=["auto", "generic", "blocked_once", "cdc", "human_gate"],
        help="mock checkpoint 策略：auto→generic；generic=DONE/审查+Harden；blocked_once=developer 首次 BLOCKED；cdc=blocked_once 别名；human_gate=审查环触顶",
    )
    parser.add_argument("--mission-id", type=str, default="", help="mission ID，默认自动生成唯一 ID")
    parser.add_argument("--goal", type=str, default="")
    parser.add_argument("--swarm-url", type=str, default="", help="Workspace API base URL (default: HERMES_WORKSPACE_URL or http://127.0.0.1:3000/api)")
    parser.add_argument("--workflow", type=str, default="", help="workflow YAML 路径，默认 radw.yaml")
    parser.add_argument(
        "--initial-workers",
        type=str,
        default="",
        help="初始派发的 worker 列表，逗号分隔。如 'researcher' 或 'architect,developer'",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="最大路由迭代次数；默认读取 workflow YAML 的 settings.max_iterations",
    )
    parser.add_argument(
        "--checkpoint-path",
        type=str,
        default="",
        help="SQLite checkpointer 路径，默认 ~/.hermes/langgraph-checkpoints.db",
    )
    parser.add_argument(
        "--resume",
        type=str,
        default="",
        choices=["", "approved", "abort"],
        help="从 human_approval 中断点恢复",
    )
    parser.add_argument(
        "--get-state",
        action="store_true",
        help="读取当前 mission 的 LangGraph 状态并输出 JSON",
    )
    parser.add_argument(
        "--list-active-gates",
        action="store_true",
        help="扫描所有处于 human gate 的 mission 并输出 JSON",
    )
    args = parser.parse_args()

    from hermes_langgraph_orchestrator.nodes import load_workspace_dotenv

    load_workspace_dotenv()

    mission_id = args.mission_id or f"mission-{int(time.time())}"
    goal = args.goal or "调研并交付可验证的实现（默认 RADW：research → architect → developer|writer）"

    swarm_url = (
        args.swarm_url.strip()
        or os.environ.get("HERMES_WORKSPACE_URL", "").strip()
        or os.environ.get("SWARM_API_URL", "").strip()
        or "http://127.0.0.1:3000/api"
    ).rstrip("/")

    if not args.get_state and not args.list_active_gates and not args.execute:
        parser.error("specify --execute, --get-state, or --list-active-gates")

    mode = (
        f"mock services ({args.mock_profile})"
        if args.mock_services
        else "真实 LLM + 真实 API"
    )

    if not args.get_state and not args.list_active_gates:
        print("=" * 60)
        print("LangGraph Orchestrator — 执行")
        print("=" * 60)
        print(f"  Goal: {goal}")
        print(f"  Mode: {mode}")
        if args.max_iterations is not None:
            print(f"  Max iterations: {args.max_iterations}")
        if args.workflow:
            print(f"  Workflow: {args.workflow}")
        print()

    checkpoint_path = getattr(args, "checkpoint_path", None)
    if not checkpoint_path:
        checkpoint_dir = os.path.expanduser("~/.hermes")
        os.makedirs(checkpoint_dir, exist_ok=True)
        checkpoint_path = os.path.join(checkpoint_dir, "langgraph-checkpoints.db")

    if args.get_state:
        state = await read_mission_state(checkpoint_path, mission_id)
        print_state_json(state)
        return

    if args.list_active_gates:
        gates = await list_active_gates(checkpoint_path)
        print_gates_json(gates)
        return

    if args.execute:
        from hermes_langgraph_orchestrator.graph import build_phase2_graph
        from hermes_langgraph_orchestrator.mock_services import (
            make_mock_classify,
            make_mock_dispatch,
            make_mock_ensure_sessions,
            make_mock_init_mission,
        )
        from hermes_langgraph_orchestrator.nodes import check_swarm_workspace

        AsyncSqliteSaver = import_async_sqlite_saver()

        if not args.mock_services and not args.resume:
            preflight_error = await check_swarm_workspace(swarm_url)
            if preflight_error:
                print(f"\n❌ Workspace preflight failed:\n   {preflight_error}\n")
                sys.exit(1)

        initial_tasks: list[dict] = []
        if args.initial_workers:
            workers = [w.strip() for w in args.initial_workers.split(",") if w.strip()]
            initial_tasks = [
                {"worker_id": w, "task": goal, "reason": f"初始派发: {w}"}
                for w in workers
            ]

        config = {"configurable": {"thread_id": mission_id}}

        async with AsyncSqliteSaver.from_conn_string(checkpoint_path) as saver:
            graph = build_phase2_graph(
                classify_fn=make_mock_classify() if args.mock_services else None,
                dispatch_fn=make_mock_dispatch(args.mock_profile) if args.mock_services else None,
                init_fn=make_mock_init_mission(args.mock_profile) if args.mock_services else None,
                ensure_fn=make_mock_ensure_sessions() if args.mock_services else None,
                checkpointer=saver,
            )

            if args.resume:
                current_state = await graph.aget_state(config)
                if current_state is None or current_state.values is None:
                    print(f"\n❌ 找不到 mission {mission_id} 的状态，无法恢复")
                    sys.exit(1)
                human_choice = os.environ.get("HERMES_LANGGRAPH_HUMAN_CHOICE")
                human_note = os.environ.get("HERMES_LANGGRAPH_HUMAN_NOTE")
                resume_target = os.environ.get("HERMES_LANGGRAPH_RESUME_TARGET")
                command = build_resume_command(
                    current_state.values,
                    args.resume,
                    human_choice=human_choice,
                    human_note=human_note,
                    target_worker_id=resume_target,
                )
                if human_choice or human_note or resume_target:
                    print(
                        f"▶ 恢复 (action={args.resume}, "
                        f"choice={human_choice or 'primary'}, "
                        f"target={resume_target or 'default'})...\n"
                    )
                else:
                    print(f"▶ 恢复 (action={args.resume})...\n")
                try:
                    result = await graph.ainvoke(command, config)  # type: ignore[arg-type]
                except Exception as e:
                    print(f"\n❌ 恢复失败: {e}")
                    import traceback

                    traceback.print_exc()
                    sys.exit(1)
            else:
                initial: OrchestratorState = {
                    "mission_id": mission_id,
                    "mission_goal": goal,
                    "swarm_api_url": swarm_url,
                    "workflow_path": args.workflow or None,
                    "checkpoints": [],
                    "terminal_checkpoints": [],
                    "collection_error": None,
                    "classifications": [],
                    "langgraph_assignments": initial_tasks,
                    "langgraph_needs_human": False,
                    "langgraph_decision": None,
                    "dispatched_workers": [],
                    "pending_human_assignments": [],
                    "dispatch_counts": {},
                    "transition_counts": {},
                    "awaiting_checkpoint": False,
                    "dispatch_results": None,
                    "dispatch_error": None,
                    "wait_attempts": 0,
                    "all_done": False,
                    "human_resume_action": None,
                    "iteration": 0,
                    "max_iterations": args.max_iterations,
                    "phase": "phase2_execute",
                    "log_entries": [],
                }

                # 默认 max_iterations 回退到 workflow YAML 的 settings
                if args.max_iterations is None:
                    workflow_path = args.workflow or ""
                    if workflow_path and os.path.exists(workflow_path):
                        try:
                            wf_spec = load_workflow(workflow_path)
                            initial["max_iterations"] = wf_spec.settings.max_iterations
                            if not args.get_state and not args.list_active_gates:
                                print(f"ℹ️  max_iterations 使用 workflow 默认值: {wf_spec.settings.max_iterations}")
                        except Exception as e:
                            if not args.get_state and not args.list_active_gates:
                                print(f"⚠️  读取 workflow 失败，使用默认 5: {e}")
                            initial["max_iterations"] = 5
                    else:
                        initial["max_iterations"] = 5

                existing = await graph.aget_state(config)
                if existing and existing.values:
                    print(
                        f"ℹ️  复用 mission checkpoint（{mission_id}），重置编排状态后重新执行。"
                        " 全新任务请换 --mission-id。"
                    )
                    await graph.aupdate_state(
                        config,
                        {
                            "all_done": False,
                            "human_resume_action": None,
                            "langgraph_needs_human": False,
                            "workflow_path": args.workflow or None,
                            "workflow_spec": None,
                            "checkpoints": [],
                            "terminal_checkpoints": [],
                            "classifications": [],
                            "pending_human_assignments": [],
                            "dispatch_results": None,
                            "dispatch_error": None,
                            "awaiting_checkpoint": False,
                            "iteration": 0,
                        },
                    )
                print(f"▶ 执行开始...\n")
                try:
                    result = await graph.ainvoke(initial, config)  # type: ignore[arg-type]
                except Exception as e:
                    print(f"\n❌ 失败: {e}")
                    import traceback

                    traceback.print_exc()
                    sys.exit(1)

            print("\n" + "=" * 60)
            print("执行结果")
            print("=" * 60)

            lang = result.get("langgraph_decision")
            if lang:
                print(f"\n🧠 最终编排决策:")
                print(f"   派发: {len(lang.assignments)} 项")
                for a in lang.assignments:
                    print(f"     → {a['worker_id']}: {a.get('reason', '')[:100]}")

            print(f"\n📊 执行统计:")
            print(f"   迭代次数: {result.get('iteration', 0)}")
            print(f"   终止: {result.get('all_done', False)}")
            print(f"   派发结果: {'成功' if result.get('dispatch_results') else '未执行/mock'}")
            if result.get("dispatch_error"):
                print(f"   派发错误: {result['dispatch_error']}")

            logs = result.get("log_entries", [])
            if logs:
                print(f"\n📋 日志 ({len(logs)} 条):")
                for l in logs:
                    print(f"   {l}")

            paused_at_gate = (
                result.get("langgraph_needs_human") is True
                and not result.get("all_done", False)
            )
            if paused_at_gate:
                workspace_base = swarm_url.removesuffix("/api")
                pending = result.get("pending_human_assignments") or []
                classifications = result.get("classifications") or []
                worker = "unknown"
                if classifications:
                    first = classifications[0]
                    worker = first.get("worker_id") if isinstance(first, dict) else getattr(first, "worker_id", "unknown")
                elif pending:
                    worker = pending[0].get("worker_id", "unknown")
                print(f"\n⏸ Mission 暂停在 Human Gate（{mission_id}，worker={worker}）")
                print(f"   打开 Dashboard 审批: {workspace_base}/swarm2")
                print("   页面会自动弹出「Mission 需要人工决策」对话框；也可点右上角警告图标。")
                print(
                    f"   CLI 恢复: python -m hermes_langgraph_orchestrator "
                    f"--execute --resume approved --mission-id {mission_id}"
                )
            else:
                print(f"\n✅ 执行完成。详细: logs/execute_*.json")


def cli() -> None:
    """Console entry point (hermes-langgraph)."""
    asyncio.run(main())


if __name__ == "__main__":
    cli()
