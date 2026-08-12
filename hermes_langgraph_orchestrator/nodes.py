"""
LangGraph Orchestrator Nodes — workflow-driven execution.

init → ensure → dispatch → wait → classify (LLM or rule fast-path) → route → ...
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from typing import Any, cast

import httpx
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pathlib import Path

# Shared swarm handoff directory. Workers are expected to write their latest
# deliverable report here so downstream workers can locate context even when
# their cwd differs from the source worker's cwd.
_HANDOFF_DIR = Path(__file__).resolve().parents[1] / "memory" / "handoffs" / "swarm"

from .state import (
    DispatchDecision,
    OrchestratorState,
    WorkerCheckpoint,
    WorkerClassification,
)
from .workflow import (
    WorkflowSpec,
    load_default_workflow,
    load_workflow,
    resolve_workflow_path,
    route_by_workflow,
    validate_workflow_against_roster,
)


# ============================================================
# LLM 配置 — classify 用；默认对齐官方 DeepSeek，可用环境变量覆盖
# HERMES_ORCHESTRATOR_MODEL / HERMES_ORCHESTRATOR_BASE_URL / DEEPSEEK_API_KEY
# ============================================================
def _get_llm() -> ChatOpenAI:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        hermes_env = os.path.expanduser("~/.hermes/.env")
        if os.path.exists(hermes_env):
            with open(hermes_env) as f:
                for line in f:
                    if "DEEPSEEK_API_KEY" in line:
                        api_key = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        break

    model = os.environ.get("HERMES_ORCHESTRATOR_MODEL", "deepseek-v4-pro")
    base_url = os.environ.get(
        "HERMES_ORCHESTRATOR_BASE_URL", "https://api.deepseek.com/v1"
    )

    return ChatOpenAI(
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=0.1,
    )


# ============================================================
# Helpers
# ============================================================
def _swarm_api_url(state: OrchestratorState) -> str:
    return state.get("swarm_api_url") or _default_swarm_api_url()


def _default_swarm_api_url() -> str:
    return (
        os.environ.get("HERMES_WORKSPACE_URL")
        or os.environ.get("SWARM_API_URL")
        or "http://127.0.0.1:3000/api"
    ).rstrip("/")


def _swarm_http_headers() -> dict[str, str]:
    """Auth headers for Workspace API calls (password-protected deployments)."""
    token = os.environ.get("HERMES_WORKSPACE_TOKEN", "").strip()
    if not token:
        sessions_path = Path(
            os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
        ) / "workspace-sessions.json"
        if sessions_path.exists():
            try:
                data = json.loads(sessions_path.read_text(encoding="utf-8"))
                tokens = data.get("tokens") or {}
                if isinstance(tokens, dict) and tokens:
                    token = next(iter(tokens.keys()))
            except Exception:
                pass
    if token:
        return {"Cookie": f"claude-auth={token}"}
    return {}


def _swarm_delivery_mode() -> str | None:
    """Map workspace env to swarm-dispatch deliveryMode (None = auto)."""
    force = os.environ.get("HERMES_SWARM_FORCE_ONESHOT", "").strip().lower()
    if force in ("1", "true", "yes"):
        return "oneshot"
    tmux_mode = os.environ.get("HERMES_SWARM_TMUX_MODE", "").strip().lower()
    if tmux_mode == "cli":
        return "tmux-cli"
    if tmux_mode == "tui":
        return "tmux-tui"
    return None


def _workspace_unreachable_hint(swarm_url: str) -> str:
    base = swarm_url.removesuffix("/api")
    return (
        f"Workspace API unreachable at {swarm_url}. "
        f"Start Workspace first: `cd hermes-workspace && pnpm dev` "
        f"(then verify `curl {base}/api/swarm-roster`). "
        f"Vite dev may need 10–30s on first SSR compile after startup. "
        f"Override URL with --swarm-url or HERMES_WORKSPACE_URL."
    )


PREFLIGHT_ATTEMPTS = 6
PREFLIGHT_READ_TIMEOUT_S = 12.0


def load_workspace_dotenv() -> None:
    """Load hermes-workspace/.env into os.environ (never overrides existing keys)."""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if not key or key in os.environ:
                continue
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ[key] = value
    except OSError:
        return


def _is_local_workspace_url(swarm_url: str) -> bool:
    lowered = swarm_url.lower()
    return "127.0.0.1" in lowered or "localhost" in lowered


def _workspace_http_timeout(read_s: float = PREFLIGHT_READ_TIMEOUT_S) -> httpx.Timeout:
    return httpx.Timeout(connect=3.0, read=read_s, write=5.0, pool=3.0)


def _workspace_http_client(swarm_url: str, read_timeout_s: float = 30.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=_workspace_http_timeout(read_timeout_s),
        trust_env=not _is_local_workspace_url(swarm_url),
    )


async def check_swarm_workspace(swarm_url: str) -> str | None:
    """Return an error message when Workspace is not reachable/authenticated."""
    roster_url = f"{swarm_url.rstrip('/')}/swarm-roster"
    last_error: str | None = None

    for attempt in range(1, PREFLIGHT_ATTEMPTS + 1):
        if attempt > 1:
            wait_s = min(1.5 * attempt, 5.0)
            log(
                f"[preflight] Workspace 未就绪 ({attempt}/{PREFLIGHT_ATTEMPTS})，"
                f"{wait_s:.0f}s 后重试（Vite 可能在编译 SSR）…"
            )
            await asyncio.sleep(wait_s)
        try:
            async with _workspace_http_client(swarm_url) as client:
                resp = await client.get(roster_url, headers=_swarm_http_headers())
            if resp.status_code == 401:
                return (
                    f"Workspace returned 401 for {swarm_url}. "
                    "Set HERMES_WORKSPACE_TOKEN to a valid claude-auth session token."
                )
            resp.raise_for_status()
            return None
        except httpx.ConnectError:
            last_error = _workspace_unreachable_hint(swarm_url)
        except httpx.TimeoutException:
            last_error = (
                f"Workspace timed out at {swarm_url} "
                f"(attempt {attempt}/{PREFLIGHT_ATTEMPTS}; "
                "Vite dev server may still be starting or compiling API routes)."
            )
        except httpx.HTTPStatusError as e:
            last_error = f"Workspace health check failed for {swarm_url}: HTTP {e.response.status_code}"
            if e.response.status_code < 500:
                return last_error
        except Exception as e:
            last_error = f"Workspace health check failed for {swarm_url}: {e}"

    if last_error:
        return f"{last_error} {_workspace_unreachable_hint(swarm_url)}"
    return _workspace_unreachable_hint(swarm_url)


async def _fetch_roster_ids(swarm_url: str) -> tuple[set[str], str | None]:
    """Fetch roster ids from Workspace API."""
    try:
        async with _workspace_http_client(swarm_url) as client:
            resp = await client.get(
                f"{swarm_url.rstrip('/')}/swarm-roster",
                headers=_swarm_http_headers(),
            )
            if resp.status_code == 401:
                return set(), (
                    "Workspace returned 401 for /swarm-roster. "
                    "Set HERMES_WORKSPACE_TOKEN or disable HERMES_PASSWORD for local runs."
                )
            resp.raise_for_status()
            data = resp.json()
            roster = data.get("roster", {})
            if isinstance(roster, dict):
                workers = roster.get("workers", [])
                if isinstance(workers, list):
                    return {
                        str(w.get("id", w.get("workerId", ""))).strip()
                        for w in workers
                        if w
                    }, None
                return {k.strip() for k in roster.keys() if isinstance(k, str)}, None
            if isinstance(roster, list):
                return {
                    str(w.get("id", w.get("workerId", ""))).strip()
                    for w in roster
                    if w
                }, None
    except httpx.ConnectError:
        return set(), _workspace_unreachable_hint(swarm_url)
    except httpx.TimeoutException:
        return set(), _workspace_unreachable_hint(swarm_url)
    except Exception as e:
        return set(), f"Failed to fetch roster: {e}"
    return set(), "Failed to parse roster response"


def _parse_dispatch_checkpoints(data: dict[str, Any]) -> list[WorkerCheckpoint]:
    checkpoints: list[WorkerCheckpoint] = []
    for r in data.get("results", []):
        cp = r.get("checkpoint")
        if not cp:
            continue
        checkpoints.append(
            WorkerCheckpoint(
                worker_id=r.get("workerId") or "unknown",
                state=cp.get("stateLabel") or "IN_PROGRESS",
                result=cp.get("result") or "",
                files_changed=cp.get("filesChanged") or "",
                commands_run=cp.get("commandsRun") or "",
                blocker=cp.get("blocker") or "",
                next_action=cp.get("nextAction") or "",
                review_outcome=cp.get("reviewOutcome") or "",
                raw=cp.get("raw") or "",
            )
        )
    return checkpoints


def _assignment_sort_key(assignment: dict[str, Any]) -> tuple[int, int]:
    """Sort mission assignments newest-first by dispatch/completion time."""
    for field in ("dispatchedAt", "completedAt", "updatedAt"):
        raw = assignment.get(field)
        if isinstance(raw, (int, float)) and raw > 0:
            return (1, int(raw))
    return (0, 0)


def _latest_assignment_checkpoints_from_mission(
    mission: dict[str, Any],
    *,
    worker_filter: set[str] | None = None,
) -> dict[str, WorkerCheckpoint]:
    """Return the newest assignment checkpoint per worker (if any)."""
    latest_assignment: dict[str, dict[str, Any]] = {}
    for assignment in mission.get("assignments", []) or []:
        if not isinstance(assignment, dict):
            continue
        wid = str(assignment.get("workerId") or "").strip()
        if not wid:
            continue
        if worker_filter is not None and wid not in worker_filter:
            continue
        prev = latest_assignment.get(wid)
        if prev is None or _assignment_sort_key(assignment) > _assignment_sort_key(prev):
            latest_assignment[wid] = assignment

    cp_map: dict[str, WorkerCheckpoint] = {}
    for wid, assignment in latest_assignment.items():
        checkpoint = assignment.get("checkpoint")
        if not checkpoint:
            continue
        cp_map[wid] = _checkpoint_from_parsed(checkpoint, wid)
    return cp_map


def _sync_cp_map_from_mission(
    cp_map: dict[str, WorkerCheckpoint],
    mission: dict[str, Any],
    *,
    current_workers: set[str],
    dispatched: set[str],
) -> None:
    """Refresh cp_map from mission store using only the latest assignment per worker."""
    latest = _latest_assignment_checkpoints_from_mission(mission, worker_filter=dispatched)
    for wid in dispatched:
        if wid in latest:
            cp_map[wid] = latest[wid]
    # A re-dispatched worker with a fresh assignment but no checkpoint yet must not
    # inherit an older terminal checkpoint from a previous assignment.
    for wid in current_workers:
        if wid not in latest:
            cp_map.pop(wid, None)


async def _harvest_worker_checkpoints(
    swarm_url: str,
    mission_id: str,
    worker_ids: list[str],
) -> None:
    """Pull fresh chat/runtime checkpoints into the mission store after async dispatch."""
    if not worker_ids:
        return
    try:
        async with _workspace_http_client(swarm_url, read_timeout_s=60.0) as client:
            await client.post(
                f"{swarm_url}/swarm-orchestrator-loop",
                json={
                    "workerIds": sorted(set(worker_ids)),
                    "missionId": mission_id,
                    "dryRun": False,
                    "autoContinue": False,
                    "allowExecution": False,
                    "staleMinutes": 30,
                },
                headers=_swarm_http_headers(),
            )
    except Exception as e:
        log(f"[harvest] failed for {worker_ids}: {e}")


def _active_assignments_to_workers(assignments: list[dict]) -> list[str]:
    return sorted({a.get("worker_id", "").strip() for a in assignments if a.get("worker_id")})


def _read_handoff(source_id: str) -> str:
    """Read the latest structured handoff for a source worker, if available."""
    path = _HANDOFF_DIR / f"{source_id}-latest.md"
    try:
        if path.exists():
            return path.read_text(encoding="utf-8")
    except Exception:
        pass
    return ""


def _worker_runtime_path(worker_id: str) -> Path:
    """Resolve <profiles>/<worker_id>/runtime.json (env override honoured)."""
    base = os.environ.get("HERMES_PROFILES_DIR") or os.path.expanduser("~/.hermes/profiles")
    return Path(base) / worker_id / "runtime.json"


def _worker_processed_state(worker_id: str) -> str:
    """Return the STATE label of the worker's last orchestrator-processed
    checkpoint (from runtime.json's orchestratorProcessedRaw), upper-cased.

    Empty string when unavailable. This reflects the worker's real terminal
    output, and unlike cp_map it is NOT overwritten by the synthetic BLOCKED
    that the poll-timeout path fabricates.
    """
    try:
        path = _worker_runtime_path(worker_id)
        if not path.exists():
            return ""
        rt = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    processed = rt.get("orchestratorProcessedRaw")
    if not isinstance(processed, str) or not processed.strip():
        return ""
    for line in processed.splitlines():
        # Tolerate markdown noise: leading '#', bold '**', code-fence lines.
        s = line.strip().lstrip("#").replace("*", "").strip()
        if s.upper().startswith("STATE:"):
            value = s.split(":", 1)[1].strip().upper()
            return value.split()[0] if value else ""
    return ""


RESEARCH_ADVERSARIAL_WORKFLOWS = frozenset({"research_adversarial_review"})


def _is_research_adversarial_workflow(state: OrchestratorState | None) -> bool:
    if not state:
        return False
    spec = state.get("workflow_spec")
    name = getattr(spec, "name", "") if spec else ""
    return name in RESEARCH_ADVERSARIAL_WORKFLOWS


def _transition_instructions(
    source_id: str,
    target_id: str,
    classification: WorkerClassification,
    decision: Any,
    state: OrchestratorState | None = None,
) -> str:
    """Return role-specific, actionable instructions for a workflow transition.

    The orchestrator owns the workflow semantics, so the concrete "what to do
    next" prompt belongs here rather than in the worker's static system prompt.
    """
    if decision.action == "retry":
        return (
            "Re-attempt your previous task. Address the blocker above directly. "
            "Return the required checkpoint format."
        )

    if target_id == "architect" and source_id == "developer":
        return (
            "Review the implementation produced by developer against the architecture/design. "
            "The developer's structured handoff is included below. Inspect the files changed, "
            "verify tests and commands run, and decide whether to approve or request changes. "
            "This is a code review gate: you MUST end your checkpoint with a line exactly like:\n"
            "REVIEW_OUTCOME: approved\n"
            "or\n"
            "REVIEW_OUTCOME: changes_requested\n"
            "Use approved only if the implementation matches the design and tests pass; "
            "otherwise use changes_requested and list concrete fixes in RESULT.\n"
            "If approved, load harden-gate and also emit HARDEN_OUTCOME: pass|fail "
            "(Gate H — required before mission complete)."
        )

    if target_id == "architect" and source_id == "writer":
        return (
            "Review the visual/narrative deliverables produced by writer against the architecture/design. "
            "The writer's structured handoff is included below. Inspect the files changed, "
            "verify accuracy, tone, and format, and decide whether to approve or request changes. "
            "This is a content review gate: you MUST end your checkpoint with a line exactly like:\n"
            "REVIEW_OUTCOME: approved\n"
            "or\n"
            "REVIEW_OUTCOME: changes_requested\n"
            "Use approved only if the deliverable matches the design intent and is ready for use; "
            "otherwise use changes_requested and list concrete fixes in RESULT.\n"
            "If approved, load harden-gate and also emit HARDEN_OUTCOME: pass|fail "
            "(Gate H — required before mission complete)."
        )

    if target_id == "developer" and source_id == "architect":
        return (
            "Implement the architecture/design produced by architect. "
            "The architect's structured handoff is included below for context. "
            "Produce concrete code, tests, and documentation. "
            "Return the required checkpoint format."
        )

    if target_id == "writer" and source_id == "architect":
        return (
            "Produce the visual or narrative deliverables specified by architect. "
            "The architect's structured handoff is included below for context. "
            "Follow the requested format (slides, HTML, video script, social copy, etc.), "
            "audience, tone, and constraints. Return the required checkpoint format."
        )

    if target_id == "architect" and source_id == "writer":
        return (
            "Review the visual/narrative deliverables produced by writer against the architecture/design. "
            "The writer's structured handoff is included below. Inspect the files changed, "
            "verify accuracy, tone, and format, and decide whether to approve or request changes. "
            "This is a content review gate: you MUST end your checkpoint with a line exactly like:\n"
            "REVIEW_OUTCOME: approved\n"
            "or\n"
            "REVIEW_OUTCOME: changes_requested\n"
            "Use approved only if the deliverable matches the design intent and is ready for use; "
            "otherwise use changes_requested and list concrete fixes in RESULT.\n"
            "If approved, load harden-gate and also emit HARDEN_OUTCOME: pass|fail "
            "(Gate H — required before mission complete)."
        )

    if target_id == "architect" and source_id == "researcher":
        if _is_research_adversarial_workflow(state):
            return (
                "Perform adversarial review of the researcher's findings (not architecture design). "
                "Challenge assumptions, missing evidence, weak citations, and overstated claims. "
                "The researcher's structured handoff is included below. "
                "You MUST end your checkpoint with a line exactly like:\n"
                "REVIEW_OUTCOME: approved\n"
                "or\n"
                "REVIEW_OUTCOME: changes_requested\n"
                "Use approved only when the research conclusions are well-supported and complete; "
                "otherwise use changes_requested and list concrete disputes in RESULT."
            )
        return (
            "Create the architecture/design specification based on the research findings. "
            "The researcher's structured handoff is included below for context. "
            "Define interfaces, data models, module boundaries, and validation criteria. "
            "At the end of your checkpoint, include ONE line exactly like:\n"
            "DELIVERABLE_TYPE: code\n"
            "or\n"
            "DELIVERABLE_TYPE: visual\n"
            "or\n"
            "DELIVERABLE_TYPE: document\n"
            "Choose 'code' if the next step should produce software/tests/build artifacts; "
            "'visual' if it should produce slides, HTML, video, or other visual/narrative assets; "
            "'document' if it should produce a polished long-form report or article. "
            "Return the required checkpoint format."
        )

    if target_id == "researcher" and source_id == "architect":
        if _is_research_adversarial_workflow(state):
            return (
                "Revise your research deliverable based on architect's adversarial review. "
                "Address each disputed point explicitly; note where you accept criticism or rebut with evidence. "
                "Stay within research scope — do not produce architecture/design specs. "
                "Return the required checkpoint format."
            )

    if target_id == "learning":
        return (
            "Summarize the completed mission, key decisions, and lessons learned. "
            "Produce terminal documentation or a handoff note. "
            "Return the required checkpoint format."
        )

    return "Take ownership of this step and produce concrete artifacts. Return the required checkpoint format."


def _infer_architect_review_outcome(
    classification: WorkerClassification,
    checkpoints: list[WorkerCheckpoint],
    state: OrchestratorState | None = None,
) -> WorkerClassification:
    """Backfill architect review_outcome when the LLM forgets to set it.

    Used for developer→architect code review and researcher→architect adversarial
    research review. If the architect returned DONE without an explicit outcome,
    inspect checkpoint text. Approval signals default to approved; change signals
    to changes_requested. For initial design (non-review), leave empty so the
    workflow can route to the chosen executor.
    """
    if classification.worker_id != "architect":
        return classification
    if classification.verdict != "DONE":
        return classification
    if classification.review_outcome:
        return classification

    raw = ""
    for cp in checkpoints:
        if cp.get("worker_id") == "architect":
            raw = (cp.get("raw") or "") + " " + (cp.get("result") or "")
            break
    raw_lower = raw.lower()

    review_context = _is_research_adversarial_workflow(state) or any(
        kw in raw_lower
        for kw in [
            "review",
            "developer",
            "researcher",
            "research",
            "implementation",
            "code review",
            "adversarial",
            "审查",
            "实现",
            "调研",
            "对抗",
        ]
    )
    if not review_context:
        return classification

    explicit = re.search(r"REVIEW[_\s]OUTCOME\s*[:=]\s*(approved|changes_requested)", raw, re.IGNORECASE)
    if explicit:
        classification.review_outcome = explicit.group(1).lower()
        return classification

    approval_signals = [
        "approved",
        "approve",
        "lgtm",
        "looks good",
        "looks correct",
        "matches the design",
        "implementation is correct",
        "tests pass",
        "no issues",
        "no problems",
        "通过",
        "符合",
    ]
    change_signals = [
        "changes_requested",
        "changes required",
        "needs changes",
        "needs work",
        "does not match",
        "does not implement",
        "missing",
        "fix",
        "issue",
        "bug",
        "broken",
        "fails",
        "未通过",
        "不符合",
    ]
    if any(sig in raw_lower for sig in approval_signals) and not any(
        sig in raw_lower for sig in change_signals
    ):
        classification.review_outcome = "approved"
        classification.reasoning = (classification.reasoning or "") + " [inferred approved]"
    elif any(sig in raw_lower for sig in change_signals):
        classification.review_outcome = "changes_requested"
        classification.reasoning = (classification.reasoning or "") + " [inferred changes_requested]"
    return classification


def _build_task_for_transition(
    source_id: str,
    target_id: str,
    checkpoint: WorkerCheckpoint,
    classification: WorkerClassification,
    decision: Any,
    state: OrchestratorState,
) -> str:
    """Build an actionable task prompt for the next worker in the workflow.

    The prompt is intentionally explicit: it states the mission goal, the
    previous worker's concrete result, the workflow transition rationale, and
    exactly what the target worker should do next.  This avoids vague prompts
    like "Continue researcher's work."
    """
    mission_goal = state.get("mission_goal", "")
    result = (checkpoint.get("result") or "").strip()
    files = (checkpoint.get("files_changed") or "").strip() or "none"
    commands = (checkpoint.get("commands_run") or "").strip() or "none"
    next_action = (checkpoint.get("next_action") or "").strip()
    reason = (decision.reason or f"{source_id} finished; hand off to {target_id}").strip()

    if decision.action == "retry":
        return (
            f"## Mission\n{mission_goal}\n\n"
            f"## Retry context\n"
            f"You ({source_id}) were previously blocked. The orchestrator has approved a retry.\n"
            f"Blocker: {classification.blocker_summary or 'unknown'}\n"
            f"Blocker type: {classification.blocker_type or 'unknown'}\n\n"
            f"## Your task\n"
            f"{_transition_instructions(source_id, target_id, classification, decision, state)}"
        )

    handoff = _read_handoff(source_id)
    lines = [
        f"## Mission",
        mission_goal,
        "",
        f"## Context from {source_id}",
        f"{source_id} has completed their task and is handing off to you ({target_id}).",
    ]
    if result:
        lines.extend([f"Result: {result}", ""])
    if next_action:
        lines.extend([f"Suggested next action: {next_action}", ""])
    lines.extend(
        [
            f"Files changed: {files}",
            f"Commands run: {commands}",
            "",
        ]
    )
    # Only inject the handoff file when the in-state checkpoint carries no
    # result text.  When result is present it comes from the current mission's
    # checkpoint and is more authoritative than the global *-latest.md file,
    # which may belong to a different mission entirely.
    if handoff and not result:
        lines.extend(
            [
                f"## Structured handoff from {source_id}",
                handoff,
                "",
            ]
        )
    lines.extend(
        [
            f"## Your task",
            f"{reason}.",
            f"As {target_id}, {_transition_instructions(source_id, target_id, classification, decision, state)}",
            "Return the required checkpoint format (STATE, FILES_CHANGED, COMMANDS_RUN, RESULT, BLOCKER, NEXT_ACTION).",
        ]
    )
    return "\n".join(lines)


# ============================================================
# Node: init_mission — load roster + workflow, validate
# ============================================================
async def init_mission(state: OrchestratorState) -> dict:
    """Load workflow.yaml, fetch roster, validate, and seed initial assignments."""
    swarm_url = _swarm_api_url(state)

    # Load workflow from explicit path or default.
    workflow_spec: WorkflowSpec
    workflow_path = state.get("workflow_path")
    if workflow_path:
        try:
            resolved = resolve_workflow_path(str(workflow_path))
            workflow_spec = load_workflow(resolved)
            workflow_path = str(resolved)
        except Exception as e:
            return {
                "collection_error": f"Failed to load workflow {workflow_path}: {e}",
                "log_entries": [f"[init_mission] workflow load failed: {e}"],
            }
    else:
        workflow_spec = state.get("workflow_spec") or load_default_workflow()
        workflow_path = None

    # Fetch roster from Workspace API.
    roster_ids, roster_error = await _fetch_roster_ids(swarm_url)
    if roster_error or not roster_ids:
        msg = roster_error or "Roster response was empty"
        return {
            "collection_error": msg,
            "log_entries": [f"[init_mission] roster fetch failed: {msg}"],
        }

    errors = validate_workflow_against_roster(workflow_spec, roster_ids)
    if errors:
        msg = "; ".join(errors)
        return {
            "collection_error": msg,
            "log_entries": [f"[init_mission] roster validation failed: {msg}"],
        }

    # Seed initial assignments from workflow entry if none provided.
    assignments = state.get("langgraph_assignments", []) or []
    if not assignments:
        entry = workflow_spec.entry
        if entry not in roster_ids:
            return {
                "collection_error": f"Entry worker '{entry}' not in roster",
                "log_entries": [f"[init_mission] entry worker '{entry}' missing from roster"],
            }
        assignments = [
            {
                "worker_id": entry,
                "task": state.get("mission_goal", ""),
                "reason": f"workflow entry: {entry}",
            }
        ]

    log(
        f"[init_mission] workflow={workflow_spec.name}, "
        f"roster={len(roster_ids)} workers, entry_assignments={len(assignments)}"
    )
    return {
        "roster_snapshot": sorted(roster_ids),
        "workflow_path": workflow_path,
        "workflow_spec": workflow_spec,
        "terminal_docs_enabled": workflow_spec.settings.terminal_docs,
        "langgraph_assignments": assignments,
        "log_entries": [
            f"[init_mission] workflow={workflow_spec.name}, roster={len(roster_ids)} workers"
        ],
    }


# ============================================================
# Node: classify — 唯一 LLM 调用
# ============================================================
CLASSIFY_PROMPT = """分析每个 Worker 的 checkpoint，输出结构化分类。

输出 JSON:
{
  "classifications": [
    {
      "worker_id": "worker 名称",
      "verdict": "DONE | BLOCKED | NEEDS_INPUT | HANDOFF | SKIP",
      "blocker_type": "missing_dependency | test_failure | timeout | architecture_decision | missing_credential | unknown | (空字符串)",
      "blocker_summary": "一句话描述阻塞原因",
      "reasoning": "一句话分类理由",
      "review_outcome": "approved | changes_requested | (空字符串)"
    }
  ]
}

review_outcome 判断规则（architect 审查 developer 实现，或 architect 对抗审查 researcher 调研时有效）:
- 如果 checkpoint 原文中包含 REVIEW_OUTCOME: approved|changes_requested，直接使用该值
- approved: 实现/调研结论符合要求，无需修改
- changes_requested: 存在问题或分歧，需要修改后重新提交
- 空字符串: 非审查场景（例如 architect 产出初始设计、尚未进入审查）

verdict 判断规则:
- DONE: 任务完成
- BLOCKED: 遇到阻塞
- NEEDS_INPUT: 需要人工输入
- HANDOFF: 需要交接
- SKIP: 仍在执行中

blocker_type 判断规则:
- missing_dependency: 缺少文件/依赖/库
- test_failure: 测试失败
- timeout: 超时
- architecture_decision: 需要架构决策
- missing_credential: 缺少 API key/凭证
- unknown: 其他
"""


def _infer_blocker_type(blocker: str, raw_lower: str) -> str:
    text = f"{blocker} {raw_lower}".lower()
    if "architecture_decision" in text or "架构决策" in text:
        return "architecture_decision"
    if "missing_dependency" in text or "缺少" in text:
        return "missing_dependency"
    if "test_failure" in text or "测试失败" in text:
        return "test_failure"
    if "timeout" in text or "超时" in text:
        return "timeout"
    if "missing_credential" in text or "api key" in text or "凭证" in text:
        return "missing_credential"
    if blocker.strip():
        return "unknown"
    return ""


def _try_rule_classify(cp: WorkerCheckpoint) -> WorkerClassification | None:
    """Fast path for checkpoints with explicit terminal STATE labels."""
    state_label = (cp.get("state") or "").strip().upper()
    if state_label not in {"DONE", "BLOCKED", "NEEDS_INPUT", "HANDOFF"}:
        return None

    raw = f"{cp.get('raw') or ''} {cp.get('result') or ''}"
    raw_lower = raw.lower()
    review_outcome = (cp.get("review_outcome") or "").strip()
    if not review_outcome and "review_outcome:" in raw_lower:
        for line in raw.splitlines():
            if "review_outcome:" in line.lower():
                review_outcome = line.split(":", 1)[1].strip().lower()
                break

    metadata: dict[str, str] = {}
    for key in ("deliverable_type", "deliverable"):
        if key in raw_lower or key.replace("_", "") in raw_lower:
            for line in raw.splitlines():
                if key.replace("_", "") in line.lower().replace("_", "") and ":" in line:
                    value = line.split(":", 1)[1].strip().lower()
                    if value:
                        metadata["deliverable_type"] = value
                        break
            if metadata.get("deliverable_type"):
                break
    # Gate C / lane routing: EXECUTOR: developer|writer (preferred over deliverable_type)
    for line in raw.splitlines():
        if "executor" in line.lower().replace("_", "") and ":" in line:
            value = line.split(":", 1)[1].strip().lower()
            if value in {"developer", "writer"}:
                metadata["executor"] = value
                break
    if metadata.get("executor") == "writer" and "deliverable_type" not in metadata:
        metadata["deliverable_type"] = "document"
    elif metadata.get("executor") == "developer" and "deliverable_type" not in metadata:
        metadata["deliverable_type"] = "code"
    # Gate H
    for line in raw.splitlines():
        compact = line.lower().replace("_", "").replace(" ", "")
        if compact.startswith("hardenoutcome:") or "harden_outcome:" in line.lower():
            value = line.split(":", 1)[1].strip().lower()
            if value in {"pass", "fail"}:
                metadata["harden_outcome"] = value
                break

    blocker_type = ""
    if state_label == "BLOCKED":
        blocker_type = _infer_blocker_type(cp.get("blocker", ""), raw_lower)

    return WorkerClassification(
        worker_id=cp["worker_id"],
        verdict=state_label,
        blocker_type=blocker_type,
        blocker_summary=cp.get("blocker", ""),
        reasoning="rule classify from STATE",
        review_outcome=review_outcome,
        metadata=metadata,
    )


async def classify_workers(state: OrchestratorState) -> dict:
    checkpoints = state.get("checkpoints", [])
    if not checkpoints:
        log("[classify] 无 checkpoint")
        return {"log_entries": ["[classify] 无 checkpoint"]}

    rule_classifications: list[WorkerClassification] = []
    ambiguous: list[WorkerCheckpoint] = []
    for cp in checkpoints:
        ruled = _try_rule_classify(cp)
        if ruled:
            rule_classifications.append(
                _infer_architect_review_outcome(ruled, checkpoints, state)
            )
        else:
            ambiguous.append(cp)

    if not ambiguous:
        summary = ", ".join(
            f"{c.worker_id}={c.verdict}/{c.review_outcome or '-'}"
            for c in rule_classifications
        )
        log(f"[classify] rule fast-path {summary}")
        return {
            "classifications": rule_classifications,
            "log_entries": [f"[classify] rule fast-path {summary}"],
        }

    log(f"[classify] 分类 {len(checkpoints)} 个 worker ({len(ambiguous)} via LLM)")
    llm = _get_llm()

    cp_text = "\n\n".join(
        f"Worker: {cp['worker_id']}\nSTATE: {cp['state']}\n"
        f"Result: {cp['result'][:300]}\nBlocker: {cp['blocker']}\nNext: {cp['next_action']}"
        for cp in ambiguous
    )

    resp = await llm.ainvoke(
        [
            SystemMessage(content=CLASSIFY_PROMPT),
            HumanMessage(
                content=f"## Mission\n{state.get('mission_goal', '')}\n\n## Checkpoints\n{cp_text}"
            ),
        ]
    )

    try:
        content = str(resp.content)
        if "```json" in content:
            js = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            js = content.split("```")[1].split("```")[0].strip()
        else:
            js = content.strip()
        data = json.loads(js)
    except (json.JSONDecodeError, IndexError):
        log("[classify] JSON 解析失败，使用默认分类")
        data = {
            "classifications": [
                {
                    "worker_id": cp["worker_id"],
                    "verdict": cp["state"],
                    "reasoning": "默认",
                    "blocker_type": "unknown" if cp["state"] == "BLOCKED" else "",
                    "blocker_summary": cp["blocker"],
                }
                for cp in ambiguous
            ]
        }

    llm_classifications = [
        _infer_architect_review_outcome(
            WorkerClassification(
                worker_id=c["worker_id"],
                verdict=c.get("verdict", "SKIP"),
                blocker_type=c.get("blocker_type", ""),
                blocker_summary=c.get("blocker_summary", ""),
                reasoning=c.get("reasoning", ""),
                review_outcome=c.get("review_outcome", ""),
                metadata=cast(dict, c.get("metadata")) if isinstance(c.get("metadata"), dict) else {},
            ),
            checkpoints,
            state,
        )
        for c in data.get("classifications", [])
    ]

    by_worker = {c.worker_id: c for c in rule_classifications}
    for c in llm_classifications:
        by_worker[c.worker_id] = c
    classifications = [by_worker[cp["worker_id"]] for cp in checkpoints if cp["worker_id"] in by_worker]

    summary = ", ".join(f"{c.worker_id}={c.verdict}/{c.review_outcome or '-'}" for c in classifications)
    log(f"[classify] {summary}")
    return {
        "classifications": classifications,
        "log_entries": [f"[classify] {summary}"],
    }


# ============================================================
# Node: route_workflow — roster-driven routing (replaces resolve_next)
# ============================================================
_STALE_BLOCKER_SIGNATURES = (
    "no parseable checkpoint found before stale threshold",
    # Removed "timeout after" and "checkpoint poll timeout" because
    # genuine timeout blockers should escalate to Human Gate per workflow.yaml,
    # not be auto-retried as stale synthetic checkpoints.
)


def _is_stale_synthetic_checkpoint(cp: WorkerCheckpoint) -> bool:
    """Return True when the checkpoint was injected by the harvester or poll
    timeout — not a real worker output — and should be auto-retried without
    going to the Human Gate."""
    blocker = (cp.get("blocker") or "").lower()
    raw = (cp.get("raw") or "").lower()
    return any(sig in blocker or sig in raw for sig in _STALE_BLOCKER_SIGNATURES)


async def route_workflow(state: OrchestratorState) -> dict:
    """Build assignments from classifications using workflow.yaml + route_by_workflow."""
    classifications = state.get("classifications", []) or []
    checkpoints = state.get("checkpoints", []) or []
    cp_map = {cp["worker_id"]: cp for cp in checkpoints}

    workflow_spec = state.get("workflow_spec") or load_default_workflow()

    dispatched: set[str] = set(state.get("dispatched_workers", []))
    existing = state.get("langgraph_assignments", []) or []
    for a in existing:
        dispatched.add(a.get("worker_id", ""))
    dispatched.discard("")
    dispatch_counts: dict[str, int] = dict(state.get("dispatch_counts", {}) or {})
    transition_counts: dict[str, int] = dict(state.get("transition_counts", {}) or {})

    assignments: list[dict] = []
    pending_human: list[dict] = []
    needs_human = False
    terminal = False
    awaiting_checkpoint = False
    analysis_parts: list[str] = []

    for c in classifications:
        decision = route_by_workflow(c, state, workflow_spec)
        outcome_str = f"({c.review_outcome})" if c.review_outcome else ""
        target_str = f" → {decision.worker_id}" if decision.worker_id else ""
        analysis_parts.append(
            f"{c.worker_id}: {c.verdict} {outcome_str}{target_str} | "
            f"{decision.action} | {decision.reason}"
        )

        if decision.action == "wait":
            # Worker still in progress; wait_for_checkpoints will keep polling.
            awaiting_checkpoint = True
            continue

        if decision.action == "done":
            terminal = True
            continue

        if decision.action == "human":
            # If the checkpoint is a synthetic stale/timeout injection (not a real
            # worker output), skip the Human Gate and auto-retry the worker instead.
            _stale_cp = cp_map.get(c.worker_id)
            if _stale_cp and _is_stale_synthetic_checkpoint(_stale_cp):
                retry_task = _build_task_for_transition(
                    c.worker_id, c.worker_id, _stale_cp, c, decision, state
                )
                assignments.append({
                    "worker_id": c.worker_id,
                    "task": retry_task,
                    "rationale": f"auto-retry after stale synthetic checkpoint (bypassing human gate): {c.blocker_summary}",
                })
                analysis_parts.append(
                    f"  → stale synthetic checkpoint for {c.worker_id}; auto-retry, skip human gate"
                )
                log(f"[route] stale synthetic checkpoint for {c.worker_id} — auto-retry, skip human gate")
                continue

            needs_human = True
            gate_task = (
                f"Human gate cleared. Retry previous task. "
                f"Blocker: {c.blocker_summary or decision.reason}"
            )
            if "Gate H:" in (decision.reason or "") and "HARDEN_OUTCOME" in (decision.reason or ""):
                arch_cp = cp_map.get("architect", {})
                arch_result = (arch_cp.get("result") or "").strip()
                gate_task = (
                    "Gate H incomplete: REVIEW_OUTCOME=approved but HARDEN_OUTCOME missing.\n"
                    "Architect must reload harden-gate and re-emit checkpoint with "
                    "HARDEN_OUTCOME: pass|fail before the mission can complete.\n\n"
                    f"Architect last result:\n{arch_result or '(none)'}"
                )
                pending_human.append(
                    {
                        "worker_id": c.worker_id,
                        "task": gate_task,
                        "reason": f"human approved retry: {decision.reason}",
                    }
                )
                continue

            if "review loop limit" in (decision.reason or ""):
                arch_cp = cp_map.get("architect", {})
                res_cp = cp_map.get("researcher", {})
                arch_result = (arch_cp.get("result") or "").strip()
                res_result = (res_cp.get("result") or "").strip()
                reason_l = (decision.reason or "").lower()
                if "harden" in reason_l:
                    exec_id = "writer" if "writer" in reason_l else "developer"
                    exec_cp = cp_map.get(exec_id, {})
                    exec_result = (exec_cp.get("result") or "").strip()
                    gate_task = (
                        f"Gate H: harden retry limit reached on {exec_id} lane.\n"
                        "Human must adjudicate remaining harden failures or waive with evidence.\n\n"
                        f"Architect last result:\n{arch_result or '(none)'}\n\n"
                        f"{exec_id.title()} last result:\n{exec_result or '(none)'}"
                    )
                elif "writer" in reason_l:
                    writer_cp = cp_map.get("writer", {})
                    writer_result = (writer_cp.get("result") or "").strip()
                    gate_task = (
                        "Gate C: 3 rounds of content review completed without approval.\n"
                        "Human must adjudicate remaining issues or approve a path forward.\n\n"
                        f"Architect last result:\n{arch_result or '(none)'}\n\n"
                        f"Writer last result:\n{writer_result or '(none)'}"
                    )
                elif "developer" in reason_l or "code review" in reason_l:
                    dev_cp = cp_map.get("developer", {})
                    dev_result = (dev_cp.get("result") or "").strip()
                    gate_task = (
                        "Gate C: 3 rounds of implementation review completed without approval.\n"
                        "Human must adjudicate remaining issues or approve a path forward.\n\n"
                        f"Architect last result:\n{arch_result or '(none)'}\n\n"
                        f"Developer last result:\n{dev_result or '(none)'}"
                    )
                else:
                    gate_task = (
                        "3 rounds of adversarial research review completed without agreement.\n"
                        "Human must adjudicate the disputed points and choose the next step.\n\n"
                        f"Architect last result:\n{arch_result or '(none)'}\n\n"
                        f"Researcher last result:\n{res_result or '(none)'}"
                    )
            pending_human.append(
                {
                    "worker_id": c.worker_id,
                    "task": gate_task,
                    "reason": f"human approved retry: {decision.reason}",
                }
            )
            continue

        if decision.action in ("dispatch", "retry"):
            target = decision.worker_id
            if target:
                if (
                    c.worker_id == "architect"
                    and target == "developer"
                    and decision.action == "dispatch"
                ):
                    dev_cp = cp_map.get("developer")
                    if dev_cp and (dev_cp.get("state") or "").upper() == "DONE":
                        analysis_parts.append(
                            "  → developer already DONE; skip stale architect→developer re-dispatch"
                        )
                        continue
                # Root-cause guard: do not re-dispatch a worker that already
                # produced a terminal DONE. The poll-timeout path fabricates a
                # synthetic BLOCKED (blocker_type=timeout) when harvest's
                # per-worker dedup (orchestratorProcessedRaw == raw) suppresses a
                # re-recorded checkpoint. That BLOCKED then drives a retry, which
                # times out again → infinite re-dispatch loop that flips the card
                # back to BLOCKED. cp_map here holds the synthetic BLOCKED, so we
                # consult the worker's real runtime state instead. Scoped to
                # self-loop retries only so genuine forward hand-offs and real
                # blockers (missing_dependency/test_failure/…) still route.
                if (
                    decision.action == "retry"
                    and c.blocker_type == "timeout"
                    and _worker_processed_state(target) == "DONE"
                ):
                    analysis_parts.append(
                        f"  → {target} already produced terminal DONE; "
                        f"skip stale timeout retry (no re-dispatch)"
                    )
                    continue
                key = f"{c.worker_id}→{target}"
                transition_counts[key] = transition_counts.get(key, 0) + 1
                dispatched.add(target)
                cp = cp_map.get(c.worker_id, {})
                task = _build_task_for_transition(
                    source_id=c.worker_id,
                    target_id=target,
                    checkpoint=cp,
                    classification=c,
                    decision=decision,
                    state=state,
                )
                assignments.append(
                    {
                        "worker_id": target,
                        "task": task,
                        "reason": decision.reason,
                        "action": decision.action,
                    }
                )
            elif target and target in dispatched:
                analysis_parts.append(f"  → {target} 已派发，跳过")

    iteration = state.get("iteration", 0)
    max_iter = state.get("max_iterations", workflow_spec.settings.max_iterations)

    # iteration 只记录系统自动 retry 次数，用于防止异常无限循环。
    # 正常 workflow 推进、human gate 阻塞、人工批准的重试/转向均不计入。
    has_auto_retry = any(a.get("action") == "retry" for a in assignments)
    next_iteration = iteration + 1 if has_auto_retry else iteration
    exceeded = next_iteration >= max_iter

    # Done only when we hit a terminal route, no human gate, no new work, and under limit.
    all_done = terminal and not needs_human and not assignments and not exceeded

    analysis = "Workflow routing:\n" + "\n".join(analysis_parts)
    analysis += (
        f"\n\n路由结果: {len(assignments)} 个派发, "
        f"needs_human={needs_human}, terminal={terminal}, done={all_done}"
    )

    decision = DispatchDecision(
        source="langgraph",
        analysis=analysis,
        assignments=assignments,
        human_approval_required=needs_human,
        metadata={
            "classifications": [
                {"worker_id": c.worker_id, "verdict": c.verdict, "blocker_type": c.blocker_type}
                for c in classifications
            ]
        },
    )

    log(f"[route] {len(assignments)} assignments, needs_human={needs_human}, done={all_done}")
    return {
        "langgraph_decision": decision,
        "langgraph_assignments": assignments,
        "pending_human_assignments": pending_human,
        "langgraph_needs_human": needs_human,
        "awaiting_checkpoint": awaiting_checkpoint,
        "dispatched_workers": list(dispatched),
        "dispatch_counts": dispatch_counts,
        "transition_counts": transition_counts,
        "iteration": next_iteration,
        "all_done": all_done,
        "log_entries": [
            f"[route] {len(assignments)} assignments, "
            f"pending_human={len(pending_human)}, needs_human={needs_human}, done={all_done}"
        ],
    }


# ============================================================
# Phase 2 nodes
# ============================================================
async def ensure_sessions(state: OrchestratorState) -> dict:
    """Idempotently ensure tmux sessions exist via POST /api/swarm-tmux-start."""
    if os.environ.get("HERMES_SWARM_FORCE_ONESHOT", "").strip().lower() in ("1", "true", "yes"):
        log("[ensure_sessions] skipped (HERMES_SWARM_FORCE_ONESHOT)")
        return {"log_entries": ["[ensure_sessions] skipped (FORCE_ONESHOT)"]}

    swarm_url = _swarm_api_url(state)
    assignments = state.get("langgraph_assignments", []) or []
    workers = _active_assignments_to_workers(assignments)

    if not workers:
        log("[ensure_sessions] 无 worker 需要启动")
        return {"log_entries": ["[ensure_sessions] 无 worker"]}

    log(f"[ensure_sessions] 预热 {len(workers)} 个 session: {workers}")
    results: list[str] = []
    session_errors: list[str] = []
    async with _workspace_http_client(swarm_url) as client:
        for wid in workers:
            try:
                resp = await client.post(
                    f"{swarm_url}/swarm-tmux-start",
                    json={"workerId": wid},
                    headers=_swarm_http_headers(),
                )
                resp.raise_for_status()
                data = resp.json()
                if data.get("alreadyRunning"):
                    results.append(f"{wid}: already-running")
                elif data.get("started"):
                    results.append(f"{wid}: started")
                else:
                    results.append(f"{wid}: ok")
            except httpx.HTTPStatusError as e:
                try:
                    body = e.response.json()
                    detail = body.get("error", body)
                except Exception:
                    detail = e.response.text or str(e)
                msg = f"{wid}: error ({detail})"
                results.append(msg)
                session_errors.append(msg)
            except Exception as e:
                results.append(f"{wid}: error ({e})")
                session_errors.append(f"{wid}: error ({e})")

    log(f"[ensure_sessions] {', '.join(results)}")
    return {
        "log_entries": [f"[ensure_sessions] {', '.join(results)}"],
        "collection_error": "; ".join(session_errors) if session_errors else None,
    }


async def dispatch_assignments(state: OrchestratorState) -> dict:
    """Unified dispatch node: fire-and-forget swarm-dispatch, then harvest + graph wait."""
    swarm_url = _swarm_api_url(state)
    mission_id = state.get("mission_id", "")
    assignments = state.get("langgraph_assignments", []) or []

    if not assignments:
        log("[dispatch] 无 assignments")
        return {
            "dispatch_results": None,
            "dispatch_error": None,
            "log_entries": ["[dispatch] 无 assignments"],
        }

    task_lines = "\n".join(
        f"  → {a.get('worker_id')} | {a.get('reason') or a.get('task', '')[:80]}"
        for a in assignments
    )
    log(f"[dispatch] 派发 {len(assignments)} 个任务 (fire-and-forget, wait in graph):\n{task_lines}")

    dispatch_timeout = 120
    dispatch_body: dict[str, Any] = {
        "assignments": [
            {
                "workerId": a["worker_id"],
                "task": a["task"],
                "rationale": a.get("reason", ""),
            }
            for a in assignments
        ],
        "missionId": mission_id,
        "timeoutSeconds": 1200,
        "checkpointPollSeconds": 300,
        "waitForCheckpoint": False,
        "allowAsync": True,
    }
    delivery_mode = _swarm_delivery_mode()
    if delivery_mode:
        dispatch_body["deliveryMode"] = delivery_mode

    try:
        async with _workspace_http_client(swarm_url, read_timeout_s=float(dispatch_timeout)) as client:
            resp = await client.post(
                f"{swarm_url}/swarm-dispatch",
                json=dispatch_body,
                headers=_swarm_http_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        detail = str(e) or type(e).__name__
        if isinstance(e, httpx.HTTPStatusError) and e.response is not None:
            try:
                body = e.response.json()
                detail = f"{detail} | {body}"
            except Exception:
                detail = f"{detail} | {e.response.text}"
        log(f"[dispatch] 失败: {detail}")
        return {
            "dispatch_results": None,
            "dispatch_error": detail,
            "log_entries": [f"[dispatch] ERROR: {detail}"],
        }

    worker_ids = [wid for a in assignments if (wid := a.get("worker_id"))]
    await _harvest_worker_checkpoints(swarm_url, mission_id, worker_ids)

    dispatch_counts = dict(state.get("dispatch_counts", {}) or {})
    dispatched_workers = list(state.get("dispatched_workers", []) or [])
    for a in assignments:
        wid = a.get("worker_id")
        if wid:
            dispatch_counts[wid] = dispatch_counts.get(wid, 0) + 1
            if wid not in dispatched_workers:
                dispatched_workers.append(wid)
    return {
        "dispatch_results": data,
        "dispatch_error": None,
        # Async dispatch must not seed classify/wait with stale runtime snapshots.
        "checkpoints": [],
        "dispatch_counts": dispatch_counts,
        "dispatched_workers": dispatched_workers,
        "log_entries": [
            f"[dispatch] {len(assignments)} tasks dispatched; harvest triggered for {worker_ids}"
        ],
    }


async def wait_for_checkpoints(state: OrchestratorState) -> dict:
    """Poll until all dispatched workers reach a terminal checkpoint.

    Dispatch returns the first fresh checkpoint, which may be IN_PROGRESS.
    This node polls Swarm missions until every tracked worker is DONE,
    BLOCKED, NEEDS_INPUT, or HANDOFF (or max polls reached).

    The returned ``checkpoints`` only contains workers from the current
    assignment batch, so downstream classify/route acts on the latest workers.
    ``terminal_checkpoints`` accumulates terminal checkpoints across the whole
    mission so we do not lose already-terminal workers when dispatch overwrites
    the checkpoint list.
    """
    swarm_url = _swarm_api_url(state)
    mission_id = state.get("mission_id", "")

    assignments = state.get("langgraph_assignments", []) or []
    current_workers = set(_active_assignments_to_workers(assignments))
    dispatched = set(state.get("dispatched_workers", []) or [])
    dispatched.update(current_workers)
    dispatched.discard("")

    if not current_workers:
        return {"awaiting_checkpoint": False, "log_entries": ["[wait] 无 current workers"]}

    terminal_states = {"DONE", "BLOCKED", "NEEDS_INPUT", "HANDOFF"}
    current_checkpoints = state.get("checkpoints", []) or []
    terminal_history = state.get("terminal_checkpoints", []) or []

    def _all_terminal(cp_map: dict[str, WorkerCheckpoint]) -> bool:
        return current_workers.issubset(cp_map.keys()) and all(
            cp["state"] in terminal_states for cp in cp_map.values()
            if cp["worker_id"] in current_workers
        )

    # Only the latest dispatch batch may short-circuit polling. Re-dispatching the
    # same worker must not reuse an older terminal checkpoint from history.
    fresh_cp_map: dict[str, WorkerCheckpoint] = {
        cp["worker_id"]: cp
        for cp in current_checkpoints
        if cp.get("worker_id") in current_workers
    }
    if _all_terminal(fresh_cp_map):
        history_map: dict[str, WorkerCheckpoint] = {
            cp["worker_id"]: cp for cp in terminal_history if cp["worker_id"] in dispatched
        }
        history_map.update(fresh_cp_map)
        return {
            "awaiting_checkpoint": False,
            "checkpoints": [fresh_cp_map[wid] for wid in current_workers if wid in fresh_cp_map],
            "terminal_checkpoints": list(history_map.values()),
            "log_entries": [f"[wait] {len(current_workers)} current workers already terminal (fresh dispatch)"],
        }

  # Do not reuse terminal history for workers in the active batch; they may have a
    # newer assignment with no checkpoint yet (e.g. architect review after design).
    cp_map: dict[str, WorkerCheckpoint] = {
        cp["worker_id"]: cp
        for cp in terminal_history
        if cp["worker_id"] in dispatched and cp["worker_id"] not in current_workers
    }
    for cp in current_checkpoints:
        wid = cp.get("worker_id")
        if wid in current_workers and wid:
            cp_map[wid] = cp

    # If current workers are already terminal, skip polling.
    if _all_terminal(cp_map):
        return {
            "awaiting_checkpoint": False,
            "checkpoints": [cp_map[wid] for wid in current_workers if wid in cp_map],
            "terminal_checkpoints": list(cp_map.values()),
            "log_entries": [f"[wait] {len(current_workers)} current workers already terminal"],
        }

    max_polls = 90
    poll_interval = 10

    for attempt in range(max_polls):
        missing = current_workers - set(cp_map.keys())
        log(f"[wait] 第 {attempt + 1}/{max_polls} 次轮询 (等待: {missing})...")

        # Drive the Swarm harvester so chat checkpoints get recorded to the
        # mission store even when no UI autopilot is running.
        # Read custom wait timeout from env (set by Human Gate "continue wait" action).
        custom_wait_minutes = os.environ.get("HERMES_LANGGRAPH_CONTINUE_WAIT_MINUTES")
        stale_minutes = 30
        if custom_wait_minutes:
            try:
                stale_minutes = max(1, int(custom_wait_minutes))
                log(f"[wait] 使用 Human Gate 指定的等待时长: {stale_minutes} 分钟")
            except ValueError:
                log(f"[wait] 无效的 HERMES_LANGGRAPH_CONTINUE_WAIT_MINUTES: {custom_wait_minutes}, 使用默认 30 分钟")

        try:
            async with _workspace_http_client(swarm_url) as client:
                await client.post(
                    f"{swarm_url}/swarm-orchestrator-loop",
                    json={
                        "workerIds": sorted(current_workers),
                        "missionId": mission_id,
                        "dryRun": False,
                        "autoContinue": False,
                        "allowExecution": False,
                        "staleMinutes": stale_minutes,
                    },
                    headers=_swarm_http_headers(),
                )
        except Exception as e:
            log(f"[wait] harvester probe failed: {e}")

        try:
            async with _workspace_http_client(swarm_url) as client:
                resp = await client.get(
                    f"{swarm_url}/swarm-missions",
                    params={"id": mission_id},
                    headers=_swarm_http_headers(),
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            log(f"[wait] API 失败: {e}")
            await asyncio.sleep(poll_interval)
            continue

        mission = data.get("mission")
        if not mission or not isinstance(mission, dict):
            await asyncio.sleep(poll_interval)
            continue

        _sync_cp_map_from_mission(
            cp_map,
            mission,
            current_workers=current_workers,
            dispatched=dispatched,
        )

        terminal_count = sum(
            1 for cp in cp_map.values() if cp["state"] in terminal_states
        )
        log(f"[wait] {terminal_count}/{len(dispatched)} terminal, {len(cp_map)} seen")

        if _all_terminal(cp_map):
            return {
                "checkpoints": [cp_map[wid] for wid in current_workers if wid in cp_map],
                "terminal_checkpoints": list(cp_map.values()),
                "awaiting_checkpoint": False,
                "log_entries": [f"[wait] all {len(current_workers)} current workers terminal after {attempt + 1} polls"],
            }

        await asyncio.sleep(poll_interval)

    log(f"[wait] {max_polls} 次轮询后仍有 worker 未完成")
    # Surface timeout as a BLOCKED checkpoint so downstream classifier
    # routes to human gate instead of looping on SKIP/IN_PROGRESS.
    # Use Chinese "超时" to trigger blocker_type=timeout while avoiding
    # _STALE_BLOCKER_SIGNATURES (which only matches English "timeout after").
    for wid in current_workers:
        if wid not in cp_map or cp_map[wid]["state"] not in terminal_states:
            cp_map[wid] = WorkerCheckpoint(
                worker_id=wid,
                state="BLOCKED",
                result=f"Checkpoint poll timeout after {max_polls} attempts",
                files_changed="",
                commands_run="",
                blocker=f"Worker did not produce a terminal checkpoint within poll window (超时 after {max_polls} polls)",
                next_action="Orchestrator should verify worker state and retry or escalate",
                raw=f"STATE: BLOCKED\nBLOCKER: 超时 after {max_polls} polls\nNEXT_ACTION: Verify worker and retry",
            )
    return {
        "checkpoints": [cp_map[wid] for wid in current_workers],
        "terminal_checkpoints": list(cp_map.values()),
        "awaiting_checkpoint": False,
        "log_entries": [f"[wait] timeout after {max_polls} polls, {len(cp_map)} checkpoints"],
    }


def _checkpoint_from_parsed(checkpoint: dict[str, Any], worker_id: str) -> WorkerCheckpoint:
    """Convert a Workspace ParsedSwarmCheckpoint dict into a WorkerCheckpoint."""
    return WorkerCheckpoint(
        worker_id=worker_id,
        state=checkpoint.get("stateLabel") or "IN_PROGRESS",
        result=checkpoint.get("result") or "",
        files_changed=checkpoint.get("filesChanged") or "",
        commands_run=checkpoint.get("commandsRun") or "",
        blocker=checkpoint.get("blocker") or "",
        next_action=checkpoint.get("nextAction") or "",
        review_outcome=checkpoint.get("reviewOutcome") or "",
        raw=checkpoint.get("raw") or "",
    )


async def human_approval_node(state: OrchestratorState) -> dict:
    """Human gate — LangGraph interrupt_before pauses here."""
    action = state.get("human_resume_action")
    log(f"[human_approval] 等待人工审批... (resume_action={action})")
    if action == "abort":
        return {
            "log_entries": [f"[human_approval] aborted (resume_action={action})"],
        }
    return {
        "log_entries": [f"[human_approval] paused (resume_action={action})"]
    }


async def finalize_mission(state: OrchestratorState) -> dict:
    """Terminal node: log execution outcome and mark done."""
    mission_id = state.get("mission_id", "unknown")
    log(f"[finalize] mission={mission_id} 完成")
    
    # 清理所有 dispatch 的 worker 的 Swarm 状态
    dispatched_workers = state.get("dispatched_workers", []) or []
    cleanup_log_entries = []
    
    for worker_id in dispatched_workers:
        # Keep live TUI sessions by default so the next mission/retry can reuse
        # them. Opt in to cleanup with HERMES_SWARM_CLEANUP_TMUX=1.
        cleanup_tmux = os.environ.get("HERMES_SWARM_CLEANUP_TMUX", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        if cleanup_tmux:
            try:
                subprocess.run(
                    ["tmux", "kill-session", "-t", f"swarm-{worker_id}"],
                    timeout=5,
                    capture_output=True,
                )
                cleanup_log_entries.append(f"[finalize] killed tmux session swarm-{worker_id}")
            except Exception as e:
                cleanup_log_entries.append(
                    f"[finalize] failed to kill tmux session swarm-{worker_id}: {e}"
                )
        else:
            cleanup_log_entries.append(
                f"[finalize] kept tmux session swarm-{worker_id} (set HERMES_SWARM_CLEANUP_TMUX=1 to kill)"
            )

        try:
            # Reset runtime.json（设置为 idle）
            runtime_path = os.path.expanduser(f"~/.hermes/profiles/{worker_id}/runtime.json")
            with open(runtime_path, "w") as f:
                f.write('{"state": "idle"}')
            cleanup_log_entries.append(f"[finalize] reset runtime.json for {worker_id}")
        except Exception as e:
            cleanup_log_entries.append(f"[finalize] failed to reset runtime.json for {worker_id}: {e}")
    
    # 写入日志
    exec_log = await log_execution(state)
    
    return {
        "all_done": True,
        "langgraph_needs_human": False,
        "human_resume_action": None,
        "log_entries": (
            [f"[finalize] mission={mission_id} complete"]
            + cleanup_log_entries
            + exec_log.get("log_entries", [])
        ),
    }


async def log_execution(state: OrchestratorState) -> dict:
    """Record Phase 2 execution results to logs/execute_*.json."""
    mission_id = state.get("mission_id", "unknown")
    lang = state.get("langgraph_decision")

    log_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs"
    )
    os.makedirs(log_dir, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(log_dir, f"execute_{mission_id}_{ts}.json")

    output = {
        "phase": "phase2_execute",
        "mission_id": mission_id,
        "mission_goal": state.get("mission_goal", ""),
        "workflow_path": state.get("workflow_path"),
        "workflow_name": getattr(state.get("workflow_spec"), "name", None),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "iterations": state.get("iteration", 0),
        "all_done": state.get("all_done", False),
        "final_decision": {
            "analysis": lang.analysis if lang else "",
            "assignments": lang.assignments if lang else [],
        },
        "dispatch_results": state.get("dispatch_results"),
        "dispatch_error": state.get("dispatch_error"),
        "classifications": [
            {
                "worker_id": c.worker_id,
                "verdict": c.verdict,
                "blocker_type": c.blocker_type,
                "review_outcome": c.review_outcome,
            }
            for c in (state.get("classifications") or [])
        ],
    }

    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    log(f"[log_execution] {log_file}")
    return {"log_entries": [f"[log_execution] {log_file}"]}


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}")
