"""
Workflow-driven routing for the LangGraph Swarm orchestrator.

Roster is the source of truth; workflow.yaml only declares the allowed
state-machine transitions.  LLMs classify checkpoints, the graph routes them.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError as exc:  # pragma: no cover - CI installs pyyaml
    raise ImportError("PyYAML is required for workflow loading") from exc

from .state import OrchestratorState, WorkerClassification


@dataclass(frozen=True)
class TransitionOn:
    verdict: str | None = None
    review_outcome: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)

    def __hash__(self):
        # dict is not hashable; freeze metadata into a sorted tuple of items.
        metadata_tuple = tuple(sorted((k, v) for k, v in self.metadata.items()))
        return hash((self.verdict, self.review_outcome, metadata_tuple))


@dataclass(frozen=True)
class WorkflowTransition:
    from_worker: str
    on: TransitionOn
    to: str | None
    reason: str = ""
    max_iterations: int | None = None
    terminal_docs: bool = False


@dataclass(frozen=True)
class BlockerConfig:
    escalate: list[str] = field(default_factory=list)
    retry: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class WorkflowSettings:
    max_iterations: int = 5
    terminal_docs: bool = False


@dataclass(frozen=True)
class WorkflowSpec:
    name: str
    version: int
    entry: str
    description: str
    transitions: list[WorkflowTransition]
    blockers: BlockerConfig
    settings: WorkflowSettings


@dataclass(frozen=True)
class RouteDecision:
    action: str  # "dispatch" | "retry" | "human" | "done"
    worker_id: str | None = None
    reason: str = ""
    terminal: bool = False


def _coerce_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def load_workflow(path: str | os.PathLike[str]) -> WorkflowSpec:
    """Load a workflow YAML file and return a validated WorkflowSpec."""
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError(f"Workflow file {path} must contain a YAML mapping")

    transitions: list[WorkflowTransition] = []
    for idx, raw in enumerate(data.get("transitions", [])):
        if not isinstance(raw, dict):
            raise ValueError(f"Transition #{idx} in {path} is not a mapping")
        on_raw = raw.get("on") or {}
        if not isinstance(on_raw, dict):
            on_raw = {}
        metadata_raw = on_raw.get("metadata") or {}
        if not isinstance(metadata_raw, dict):
            metadata_raw = {}
        metadata = {str(k).strip(): str(v).strip() for k, v in metadata_raw.items()}
        transitions.append(
            WorkflowTransition(
                from_worker=str(raw["from"]).strip(),
                on=TransitionOn(
                    verdict=_coerce_str(on_raw.get("verdict")),
                    review_outcome=_coerce_str(on_raw.get("review_outcome")),
                    metadata=metadata,
                ),
                to=_coerce_str(raw.get("to")),
                reason=str(raw.get("reason", "")).strip(),
                max_iterations=raw.get("max_iterations"),
                terminal_docs=bool(raw.get("terminal_docs", False)),
            )
        )

    blockers_raw = data.get("blockers") or {}
    if not isinstance(blockers_raw, dict):
        blockers_raw = {}
    blockers = BlockerConfig(
        escalate=[str(x).strip() for x in blockers_raw.get("escalate", []) if x],
        retry=[str(x).strip() for x in blockers_raw.get("retry", []) if x],
    )

    settings_raw = data.get("settings") or {}
    if not isinstance(settings_raw, dict):
        settings_raw = {}
    settings = WorkflowSettings(
        max_iterations=int(settings_raw.get("max_iterations", 5)),
        terminal_docs=bool(settings_raw.get("terminal_docs", False)),
    )

    return WorkflowSpec(
        name=str(data.get("name", Path(path).stem)).strip(),
        version=int(data.get("version", 1)),
        entry=str(data["entry"]).strip(),
        description=str(data.get("description", "")).strip(),
        transitions=transitions,
        blockers=blockers,
        settings=settings,
    )


def default_workflow_path() -> Path:
    pkg = Path(__file__).parent
    return pkg / "workflows" / "radw.yaml"


def resolve_workflow_path(path: str | os.PathLike[str]) -> Path:
    """Resolve a workflow path relative to the Hermes workspace root when needed."""
    raw = Path(path).expanduser()
    if raw.is_file():
        return raw.resolve()

    pkg_dir = Path(__file__).parent
    workspace_root = pkg_dir.parent

    # Short id: research_only -> workflows/research_only.yaml
    workflow_name = raw.name if raw.suffix else f"{raw.name}.yaml"
    if not raw.suffix or raw.suffix == ".yaml":
        for base in (pkg_dir / "workflows", workspace_root / "hermes_langgraph_orchestrator" / "workflows"):
            candidate = (base / workflow_name).resolve()
            if candidate.is_file():
                return candidate

    candidate = (workspace_root / raw).resolve()
    if candidate.is_file():
        return candidate
    pkg_candidate = (pkg_dir / raw).resolve()
    if pkg_candidate.is_file():
        return pkg_candidate
    return raw


def load_default_workflow() -> WorkflowSpec:
    return load_workflow(default_workflow_path())


def validate_workflow_against_roster(
    workflow: WorkflowSpec, roster_ids: set[str]
) -> list[str]:
    """Return a list of validation errors if the workflow references unknown workers."""
    errors: list[str] = []
    referenced = {workflow.entry}
    for t in workflow.transitions:
        referenced.add(t.from_worker)
        if t.to:
            referenced.add(t.to)

    for wid in referenced:
        if wid not in roster_ids:
            errors.append(f"Workflow references unknown worker '{wid}' not in roster")

    return errors


def _transition_matches(
    transition: WorkflowTransition, classification: WorkerClassification
) -> bool:
    if transition.from_worker != classification.worker_id:
        return False
    if transition.on.verdict and transition.on.verdict != classification.verdict:
        return False
    if (
        transition.on.review_outcome
        and transition.on.review_outcome != classification.review_outcome
    ):
        return False
    # Metadata conditions are ANDed. Empty metadata always matches.
    classification_metadata = getattr(classification, "metadata", None) or {}
    for key, expected in transition.on.metadata.items():
        actual = str(classification_metadata.get(key, "")).strip()
        # Support comma-separated OR values, e.g. "visual,document".
        expected_values = {v.strip() for v in expected.split(",") if v.strip()}
        if actual not in expected_values:
            return False
    return True


def _workflow_uses_gate_h(wf: WorkflowSpec) -> bool:
    """True when any approved transition requires harden_outcome metadata (Gate H)."""
    for transition in wf.transitions:
        if transition.on.review_outcome == "approved" and "harden_outcome" in transition.on.metadata:
            return True
    return False


def route_by_workflow(
    classification: WorkerClassification,
    state: OrchestratorState,
    workflow: WorkflowSpec | None = None,
    transition_counts: dict[str, int] | None = None,
) -> RouteDecision:
    """Roster-driven routing decision based on a worker classification.

    The workflow is the source of routing truth; roster membership is validated
    at startup.  Unknown blocker types default to escalation.
    """
    wf = workflow or state.get("workflow_spec") or load_default_workflow()
    max_iter = state.get("max_iterations", wf.settings.max_iterations)
    roster_ids = set(state.get("roster_snapshot", []))
    counts = transition_counts if transition_counts is not None else dict(state.get("transition_counts") or {})

    # Gate H: workflows that declare harden_outcome on approved transitions require
    # HARDEN_OUTCOME after REVIEW_OUTCOME=approved (missing → human, not silent ship).
    if (
        classification.verdict == "DONE"
        and classification.review_outcome == "approved"
        and _workflow_uses_gate_h(wf)
    ):
        harden = str((classification.metadata or {}).get("harden_outcome", "")).strip().lower()
        if harden not in ("pass", "fail"):
            return RouteDecision(
                action="human",
                reason=(
                    "Gate H: HARDEN_OUTCOME pass|fail required after "
                    "REVIEW_OUTCOME=approved (load harden-gate skill)"
                ),
            )

    # BLOCKED / NEEDS_INPUT / HANDOFF handling
    if classification.verdict == "BLOCKED":
        if classification.blocker_type in wf.blockers.retry:
            return RouteDecision(
                action="retry",
                worker_id=classification.worker_id,
                reason=f"blocker '{classification.blocker_type}' → retry",
            )
        return RouteDecision(
            action="human",
            reason=f"blocker '{classification.blocker_type}' → escalate",
        )

    if classification.verdict in ("NEEDS_INPUT", "HANDOFF"):
        return RouteDecision(
            action="human",
            reason=f"verdict {classification.verdict} → human gate",
        )

    # IN_PROGRESS / SKIP: nothing to route yet, keep polling.
    if classification.verdict == "SKIP":
        return RouteDecision(
            action="wait",
            worker_id=classification.worker_id,
            reason="worker still in progress",
        )

    # DONE / terminal routing
    for transition in wf.transitions:
        if not _transition_matches(transition, classification):
            continue

        # Terminal-docs lane is optional; only take it when explicitly enabled.
        if transition.terminal_docs and not wf.settings.terminal_docs:
            continue

        if transition.to is None:
            return RouteDecision(
                action="done",
                terminal=True,
                reason=transition.reason or "workflow reached terminal state",
            )

        # Per-transition loop guard for review loops (developer ↔ architect)
        loop_max = transition.max_iterations
        key = f"{classification.worker_id}→{transition.to}"
        if loop_max is not None and counts.get(key, 0) >= loop_max:
            return RouteDecision(
                action="human",
                reason=(
                    f"review loop limit ({loop_max}) reached for "
                    f"{classification.worker_id} → {transition.to}"
                ),
            )

        # Roster sanity check (should already pass startup validation)
        if transition.to not in roster_ids:
            return RouteDecision(
                action="human",
                reason=f"target worker '{transition.to}' not in roster",
            )

        return RouteDecision(
            action="dispatch",
            worker_id=transition.to,
            reason=transition.reason or f"{classification.worker_id} DONE → {transition.to}",
        )

    # No transition matched — escalate rather than silently terminating.
    return RouteDecision(
        action="human",
        reason=(
            f"no workflow transition for {classification.worker_id} "
            f"with verdict={classification.verdict} review={classification.review_outcome}"
        ),
    )
