# Plan 001: AI Agent Discovery Service — Unified Discovery, Inventory & Governance

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f1d1e24..HEAD -- genai-engine/src/services/task/global_agent_polling_service.py genai-engine/src/services/trace/trace_ingestion_service.py genai-engine/src/db_models/task_models.py genai-engine/src/schemas/agent_discovery_schemas.py genai-engine/src/routers/v1/agent_polling_routes.py`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (3-4 weeks, phased)
- **Risk**: MED (expands polling surface; touches task creation path which is tenant-scoped)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `f1d1e24`, 2026-09-01

## Why this matters

Arthur Engine already advertises "Agent discovery" (`genai-engine/README.md` Quickstart, platform free tier) but today only discovers (a) Vertex AI Agent Engines via `GlobalAgentPollingService._discover_gcp_agents()` and (b) OTEL-instrumented agents via `TraceIngestionService` auto-create on `service.name`. There is no network/cloud/code inventory, no shadow-AI detection, no unified catalog, and no risk classification. Building a dedicated Discovery Service reusing those two hooks turns Arthur from a passive receiver into an active inventory — the prerequisite for governance, guardrails-at-scale, and cost control. This plan makes every agent in the estate visible, enriched, and governable.

## Current state

Relevant files and their roles:

- `genai-engine/src/services/task/global_agent_polling_service.py:35` — `GlobalAgentPollingService`, single discovery+polling loop. Leader election via `POLLING_ADVISORY_LOCK_KEY = 17449340` + `pg_try_advisory_lock` (`global_agent_polling_service.py:77-85`). `_discover_gcp_agents()` lists `vertexai.Client(...).agent_engines.list()` (`global_agent_polling_service.py:158-162`), creates `Task(is_agentic=True,is_autocreated=True,task_metadata=GCPAgentCreationSource)` (`global_agent_polling_service.py:230-245`), mappings via `ServiceNameMappingRepository.create_mapping()` (`global_agent_polling_service.py:252`). Interval 3600s (`global_agent_polling_service.py:41-46`).

- `genai-engine/src/services/trace/trace_ingestion_service.py:120` — `TraceIngestionService.process_trace_data()` decodes `ExportTraceServiceRequest` protobuf, extracts `service.name` + `task_id` from resource attributes (`trace_ingestion_service.py:145-152`), calls `_resolve_task_id()` which auto-creates `OTELAgentCreationSource(service_names=...)` tasks when `service.name` unknown, and stores `DatabaseSpan` + `DatabaseTraceMetadata`. This is OTEL auto-discovery.

- `genai-engine/src/db_models/task_models.py:20` — `DatabaseTask(tasks)` with `is_agentic`, `is_autocreated`, `org_id`, `task_metadata JSON` (holds `creation_source`). `DatabaseServiceNameTaskMapping` (`db_models/telemetry_models.py`) immutable mapping.

- `genai-engine/src/schemas/agent_discovery_schemas.py:4` — `DiscoverAndPollResponse(discovered, traces_fetched)`, `ExecutePollingResponse`.

- `genai-engine/src/routers/v1/agent_polling_routes.py:32` — `POST /api/v1/tasks/{task_id}/agent-polling/execute` and `POST /api/v1/agent-polling/execute-all?wait_for_completion&timeout` (`agent_polling_routes.py:54,67`). Admin-only `AGENT_POLLING_ADMIN` (`schemas/enums.py:112`).

- `arthur-observability-sdk/python/src/arthur_observability_sdk/arthur.py:28` — SDK requires `task_id|task_name|service_name`; `setup_telemetry(service_name=...)` creates `TracerProvider + OTLP HTTP Bearer` (`arthur.py:78-80`). 33 optional `openinference-instrumentation-*` extras (`python/pyproject.toml:14-50`).

- `genai-engine/src/repositories/tasks_repository.py:209` — `_extract_agent_metadata()` extracts tools/sub-agents/models from spans (last 30d), and `_get_task_creation_source()` injects `service_names` into `GCPAgentCreationSource|OTELAgentCreationSource`.

- `genai-engine/src/services/trace/external_trace_retrieval_service.py:18` — fetches GCP Cloud Trace `TraceServiceClient.get_trace` and converts to GenAI format for polling.

Conventions to follow (from `genai-engine/CLAUDE.md`):
- Pydantic `BaseModel` for all typed payloads, never raw dicts (`CLAUDE.md:32`). Use `response_format=MyModel` pattern.
- DB sessions via `Depends(get_db_session)` auto-closed; no `try/finally: close` in routes (`CLAUDE.md:27`).
- Multi-tenancy: every task in one `org_id`; tenant keys scoped, admin keys `org_id=NULL` (`CLAUDE.md:36`, `docs/MULTI_TENANCY_DESIGN.md`). New endpoints must apply `@enforce_org_scope()` / `@permission_checker()`.
- `uv` projects + `uv.lock` must stay in sync (`CLAUDE.md:20`).
- Pre-commit runs `uv run pytest -m "unit_tests" --cov=src --cov-fail-under=79` (`genai-engine/CLAUDE.md:10`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install genai-engine | `cd genai-engine && uv sync --group dev --group linters` | exit 0 |
| Typecheck | `cd genai-engine && uv run mypy src --strict` | exit 0 |
| Unit tests | `cd genai-engine && uv run pytest -m "unit_tests" --cov=src --cov-fail-under=79` | all pass, ≥79% |
| Route security | `cd genai-engine && uv run routes_security_check` | no missing decorators |
| Alembic check | `cd genai-engine && uv run alembic revision --autogenerate -m "test" --dry-run` | no diff or expected diff |
| SDK tests | `cd arthur-observability-sdk/python && uv run pytest tests -v` | all pass |

## Scope

**In scope** (only these should be modified/created):

- `genai-engine/src/services/discovery/` (new package — adapters, registry, scheduler)
- `genai-engine/src/schemas/agent_discovery_schemas.py` (extend)
- `genai-engine/src/routers/v1/agent_polling_routes.py` (add `GET /discovery/*` inventory routes)
- `genai-engine/src/routers/v2/task_management_routes.py` (add `GET /agent-tasks/inventory` facets)
- `genai-engine/src/db_models/discovery_models.py` (new: `discovery_runs`, `discovered_agents`)
- `genai-engine/alembic/versions/*` (new migration)
- `genai-engine/src/repositories/discovery_repository.py` (new)
- `genai-engine/src/services/task/global_agent_polling_service.py` (refactor to delegate to DiscoveryRegistry)
- `genai-engine/ui/src/features/discovery/` (new UI slice)
- Tests under `genai-engine/tests/unit/services/discovery/` and `tests/unit/routes/tasks/test_agent_polling_routes.py`

**Out of scope** (do NOT touch, even though related):

- `ml-engine/` — batch metrics engine stays unchanged.
- `genai-engine/src/scorer/` — guardrail scorers out of scope.
- `arthur-observability-sdk/python/src/arthur_observability_sdk/arthur.py` — only add docs, no API break.
- Broadening `pg_try_advisory_lock` to other services.
- Changes to `DatabaseTask` columns beyond adding `discovery_source` enum — keep columns minimal, use JSON `task_metadata`.

## Git workflow

- Branch: `advisor/001-ai-agent-discovery`
- Commit per phase; conventional commits e.g. `feat(discovery): add registry and OTEL adapter`
- Do NOT push or open PR unless operator instructs.

## Steps

### Phase A — Foundation: Discovery Registry + OTEL Enhancements (M, ~1 week)

**Goal:** Unify existing GCP + OTEL paths behind a pluggable registry; enrich OTEL discovery to produce a queryable inventory.

#### Step A1: Create `discovery_models.py` + migration

Create `genai-engine/src/db_models/discovery_models.py`:

```python
class DatabaseDiscoveryRun(Base):
    __tablename__ = "discovery_runs"
    id: Mapped[str] = pk
    started_at, finished_at: Mapped[datetime]
    source: Mapped[str]  # enum: GCP|OTEL|K8S|GITHUB|GATEWAY
    discovered_count: Mapped[int]
    status: Mapped[str]  # completed|failed
    error: Mapped[str | None]

class DatabaseDiscoveredAgent(Base):
    __tablename__ = "discovered_agents"
    id, task_id: Mapped[str]  # task_id FK tasks.id
    source: Mapped[str]
    raw_identifier: Mapped[str]  # e.g. gcp resource path or service.name
    first_seen_at, last_seen_at: Mapped[datetime]
    fingerprint: Mapped[dict | None]  # JSON: framework, model, tools
```

Run `uv run alembic revision --autogenerate -m "add discovery runs"` and verify `DatabaseDiscoveryRun` + `DatabaseDiscoveredAgent` appear. Keep `DatabaseTask` unchanged — link via `task_id` FK.

**Verify:** `uv run alembic upgrade head` → exit 0; `uv run pytest -m "unit_tests" -k discovery` → collection succeeds (0 tests yet).

#### Step A2: Create `services/discovery/` package

```
services/discovery/
  __init__.py          # DiscoveryRegistry, DiscoveryAdapter Protocol
  otel_adapter.py      # wraps TraceIngestionService._resolve_task_id logic
  gcp_adapter.py       # extracts _discover_gcp_agents loop
  base.py              # Protocol: discover() -> list[DiscoveredAgentCandidate]
```

`base.py` Protocol:

```python
class DiscoveryAdapter(Protocol):
    source: str
    def discover(self, db_session: Session) -> list[DiscoveredAgentCandidate]: ...
```

`DiscoveredAgentCandidate` = Pydantic `BaseModel` with `raw_identifier, display_name, source, fingerprint: dict, task_metadata: TaskMetadata`.

`otel_adapter.py` should NOT duplicate ingestion — it queries `DatabaseServiceNameTaskMapping` + `DatabaseSpan` for `service.name` unseen in last 7d, calling `TaskRepository.create_task()` with `OTELAgentCreationSource(service_names=[...])` + `is_autocreated=True`. This moves OTEL auto-create from hot-path ingestion to explicit discovery run (ingestion keeps fast-path auto-create but also logs to `discovered_agents`).

`gcp_adapter.py` moves the existing `vertexai.Client(...).agent_engines.list()` loop verbatim, preserving `project/region` eligibility check (`global_agent_polling_service.py:300-318`) and `DEFAULT_ORG_ID` assignment.

**Verify:** `uv run mypy src --strict` → no errors for new package; `uv run pytest -m "unit_tests" tests/unit/services/discovery/test_registry.py` → new tests pass (write 3 unit tests mocking `vertexai` and `get_db_session`).

#### Step A3: Refactor `GlobalAgentPollingService` to delegate

Change `global_agent_polling_service.py:_discover_gcp_agents()` to `DiscoveryRegistry.discover_all(source_filter=None)` which iterates adapters, writes `DatabaseDiscoveryRun` rows, and returns aggregated count. Keep `_poll_all_gcp_tasks()` unchanged (trace fetching). Update `_discover_and_poll_agents()` to call registry then poll. Preserve advisory lock and background loop (`global_agent_polling_service.py:66-110`).

**Verify:** `uv run pytest -m "unit_tests" tests/unit/services/test_global_agent_polling_service.py` → existing tests still pass (they mock `_discover_and_poll_agents`).

### Phase B — Coverage: K8s, GitHub, Gateway adapters (M, ~1 week)

#### Step B1: K8s adapter (`k8s_adapter.py`)

Scans in-cluster deployments for agent signatures: env vars `OTEL_SERVICE_NAME`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, image names containing `langchain|crewai|autogen|openinference`, annotations `arthur.ai/task-id`. Use `kubernetes` client (add to `pyproject.toml` via `uv add kubernetes==32*`). Requires `K8S_DISCOVERY_ENABLED` env gate (default off). Returns candidates with `fingerprint.framework` inferred from image/env.

**Verify:** Unit test with `unittest.mock.patch("kubernetes.config.load_incluster_config")` → returns 2 candidates; `uv run routes_security_check --short` → still clean.

#### Step B2: GitHub code adapter (`github_adapter.py`)

Searches org repos for agent framework imports (`from crewai import`, `openinference`, `arthur-observability-sdk`) via GitHub Search API. Uses `GITHUB_TOKEN` env. Rate-limited, paginated, writes `raw_identifier = repo:filepath`. Useful for shadow-AI (un-deployed agents).

**Verify:** Mock `httpx.get` to GitHub API → 1 candidate; no live calls in CI.

#### Step B3: Gateway / proxy log adapter (`gateway_adapter.py`)

Parses outbound LLM calls from API gateway logs (e.g., NGINX/Envoy access logs or AWS API GW) where `host in (api.openai.com, api.anthropic.com, bedrock)` and `x-service-name` header present but no `task_id` exists. Pluggable: file tail or S3 read (`clients/s3/S3Client`). Initially file-based for local dev.

**Verify:** Feed fixture `tests/fixtures/gateway.log` → discovers 1 `service.name=gateway-shadow-bot`.

Register all adapters in `DiscoveryRegistry` with feature flags (`GENAI_ENGINE_DISCOVERY_K8S`, `_GITHUB`, `_GATEWAY`).

### Phase C — Enrichment & Inventory API (M, ~5 days)

#### Step C1: Enrichment service (`enrichment.py`)

On each `DiscoveredAgentCandidate`, call:

- `TasksRepository._extract_agent_metadata()` for tools/sub-agents/models from spans (`tasks_repository.py:209`).
- LLM fingerprint: `clients/llm/llm_client.py` to classify `agent_type` (chatbot|RAG|workflow|code-exec) from `task_metadata` + span samples (optional, gated).
- Risk score: if `creation_source==OTEL` + `is_autocreated` + no `rule_links` → `risk=HIGH` (unguarded shadow).

Write enriched JSON to `DatabaseDiscoveredAgent.fingerprint`.

**Verify:** `uv run pytest -m "unit_tests" tests/unit/services/discovery/test_enrichment.py` → fingerprint contains `tools`, `models`, `risk`.

#### Step C2: Inventory routes

Extend `agent_discovery_schemas.py`:

```python
class AgentInventoryItem(BaseModel):
    task_id, name, source, first_seen_at, last_seen_at, fingerprint, is_agentic, risk: str

class AgentInventoryResponse(BaseModel):
    items: list[AgentInventoryItem]
    total: int
    facets: dict[str, int]  # by source, by risk, by framework
```

Add to `agent_polling_routes.py`:

- `GET /api/v1/discovery/inventory` (query: `source`, `risk`, `framework`, pagination via `common_pagination_parameters` from `utils/utils.py`).
- `GET /api/v1/discovery/runs` (list `DatabaseDiscoveryRun`).
- `POST /api/v1/discovery/scan` (trigger `DiscoveryRegistry.discover_all()` synchronously, returns `DiscoverAndPollResponse` — reuses existing `AGENT_POLLING_ADMIN` permission).

Reuse `@permission_checker(permissions=PermissionLevelsEnum.AGENT_POLLING_ADMIN.value)` and `Depends(get_db_session)` patterns from `agent_polling_routes.py:54`.

Also extend `task_management_routes.py` with `GET /api/v2/agent-tasks?is_agentic=true&source=OTEL` facet filter (adds `creation_source` filter to existing `SearchTasksRequest`).

**Verify:** `uv run pytest -m "unit_tests" tests/unit/routes/tasks/test_agent_polling_routes.py` → new inventory tests pass; `curl localhost:3030/docs` shows new `Agent Discovery` tag.

### Phase D — UI + Governance hooks (S, ~3 days)

#### Step D1: UI slice `genai-engine/ui/src/features/discovery/`

Mirror existing `ui/src/features/task-tour/` pattern (MUI `sx` + theme tokens per `genai-engine/ui/CLAUDE.md`). Pages:

- `/discovery` table with columns `Name | Source (GCP/OTEL/K8S/GITHUB/GATEWAY) | Framework | Risk | Last Seen | Guardrails`. Facets top bar. Uses `lib/api-client/api-client.ts` pattern for `discovered` field already present.
- `DiscoveredAgentDrawer` showing `fingerprint.tools`, `sub_agents`, `models`, `service_names`, and CTA "Enforce guardrails" → links to `POST /api/v2/tasks/{task_id}/rules`.

Add route in `ui/src/App.tsx` (or equivalent) guarded by `AGENT_POLLING_ADMIN`.

**Verify:** `cd genai-engine/ui && yarn typecheck && yarn build` → exit 0.

#### Step D2: Auto-policy + alerts

On discovery of `risk=HIGH`, emit `TelemetryEventTypes.TASK_CREATE_INITIATED` via `clients/telemetry/telemetry_client.py` and optionally create default rules via `TaskRepository.create_task(with_default_rules=True)` vs `False` toggle. Add `GENAI_ENGINE_DISCOVERY_AUTO_GUARDRAIL` env (default false for demo, true for enterprise per `README.md:135` enterprise notes).

**Verify:** Unit test: discovering OTEL agent with no rules → `RuleRepository.query_rules` called with default scope.

## Test plan

- New unit tests (model after `tests/unit/services/test_global_agent_polling_service.py` and `tests/unit/routes/tasks/test_agent_polling_routes.py`):
  - `test_registry.py` — registry iterates 4 adapters, aggregates counts, writes `discovery_runs`.
  - `test_gcp_adapter.py` — mocks `vertexai.Client`, verifies eligibility skip for wrong project/region.
  - `test_otel_adapter.py` — pre-seeded `service_name_mapping`, verifies auto-create + `is_autocreated`.
  - `test_k8s_adapter.py`, `test_github_adapter.py`, `test_gateway_adapter.py` — mocked clients, deterministic.
  - `test_enrichment.py` — verifies risk scoring.
  - `test_discovery_routes.py` — inventory pagination, facets, permission 403 vs 200.
- Existing tests must still pass: `uv run pytest -m "unit_tests"`.
- Integration: `./tests/test_remote.sh` with `REMOTE_TEST_URL=http://localhost:3030` should show `GET /api/v1/discovery/inventory` returning discovered count after `POST /api/v1/agent-polling/execute-all?wait_for_completion=false`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `uv run mypy src --strict` exits 0
- [ ] `uv run pytest -m "unit_tests" --cov=src --cov-fail-under=79` exits 0, includes ≥10 new tests for discovery
- [ ] `uv run routes_security_check --short` exits 0, no missing `@permission_checker`/`@enforce_org_scope`
- [ ] `uv run alembic upgrade head` applies migration adding `discovery_runs` + `discovered_agents` without error
- [ ] `grep -rn "_discover_gcp_agents" genai-engine/src --include="*.py"` returns only registry delegation line (old inline loop removed)
- [ ] `GET /api/v1/discovery/inventory` returns `facets` + paginated `items` (manual curl against docker-compose stack)
- [ ] `genai-engine/ui` builds: `yarn build` exits 0, `/discovery` route renders
- [ ] No files outside in-scope list modified (`git status --porcelain` only shows `services/discovery/**`, `db_models/discovery_models.py`, `schemas/agent_discovery_schemas.py`, `routers/**`, `alembic/**`, `repositories/discovery_repository.py`, `ui/src/features/discovery/**`, tests)
- [ ] `plans/README.md` row for 001 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `genai-engine/src/services/task/global_agent_polling_service.py` no longer contains `POLLING_ADVISORY_LOCK_KEY` or advisory lock logic (drift — plan assumes leader election stays).
- `TraceIngestionService._resolve_task_id()` no longer auto-creates tasks (OTEL discovery path changed — need re-design).
- `DatabaseTask` schema diverges from `task_models.py:20` (columns changed, `task_metadata` type changed).
- `arthur-observability-sdk` `service_name` auto-create contract changed (SDK no longer sends `service.name` as resource attr).
- Any discovery adapter requires a new VPC/network permission not grantable via env var (e.g., needs sidecar).
- Verification fails twice after reasonable fix (report logs).

## Maintenance notes

For the human/agent who owns this after landing:

- Each new discovery source is one adapter implementing `DiscoveryAdapter.discover()`. Add it, register in `DiscoveryRegistry`, gate via `GENAI_ENGINE_DISCOVERY_<SOURCE>` env. Do not add `if source==...` branches elsewhere.
- If pagination is added to discovery, batching in `DiscoveryRegistry.discover_all()` must be revisited — it currently loops adapters sequentially.
- The `discovered_agents.fingerprint` JSON is schemaless — validate via Pydantic before UI render; future `agent_type` classifiers should version the fingerprint (`fingerprint_version` field) to allow migration.
- Leader election is still single-replica via `pg_try_advisory_lock`. If discovery interval drops below 60s or sources add latency, consider moving to `pg_advisory_xact_lock` + dedicated worker pool.
- Keep `DEFAULT_ORG_ID` assignment for auto-created tasks until org-aware discovery lands; tenant-scoped discovery (`org_id` from API key) is explicit follow-up (deferred).
- Reviewer focus: tenant isolation on new `GET /discovery/inventory` (must filter by `org_scope`), idempotency of `create_mapping()` under concurrent discovery runs, and GitHub/K8s token handling (never log tokens, use `SecretStr`).

