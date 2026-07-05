# Registry Authority Decision

Status: `CANONICAL_REGISTRY_NOT_DEFINED`

## Decision

Repository evidence does not define or configure a canonical registry for PDF-derived knowledge. No production endpoint, database schema, table, namespace, sandbox, or authentication contract can be verified. Registry secrets must not be requested until the Founder approves an authority and an isolated test target.

## Candidates found

### 1. Workspace filesystem Knowledge Base — recommended candidate

- Evidence: `src/server/knowledge-config.ts`, `src/server/knowledge-browser.ts`, and `src/routes/api/knowledge/{config,list,read,search,sync}.ts`.
- Type: local or GitHub-backed Markdown filesystem exposed through authenticated Workspace HTTP routes.
- Schema authority: Markdown and parsed frontmatter fields (`title`, `type`, `domain`, `status`, `tags`, `summary`, `created`, `updated`). No PDF record schema or migration exists.
- Advantages: implemented, auditable files, existing read/search behavior, and smallest visible integration surface.
- Risks: no proven production root, namespace model, isolated test root, PDF adapter, transaction boundary, or rollback contract. GitHub sync is a source/cache mechanism, not proof of canonical authority.
- Recommendation: the sole candidate for Founder review, conditional on explicitly designating separate production and sandbox roots and approving a PDF schema. It is not authority until approved.

### 2. HTTP registry assumed by the handoff probe

- Evidence: `verify_external_registry.py`, `setup_secrets.sh`, and `approval_manifest_template.json` in this directory.
- Type: generic HTTPS Bearer-token prototype using `/namespaces/<name>`.
- Advantages: models authentication and namespace isolation.
- Risks: no endpoint, server implementation, schema, deployment, production namespace, test namespace, or matching adapter exists in repository evidence.

### 3. PostgreSQL/pgvector

- Evidence: `assets/mcp-presets.seed.json`, `evidence/postgres_cutover_removal_20260629_151431.md`, and `compose.production.yaml`.
- Type: generic read-only MCP preset; PostgreSQL cutover flags are disabled.
- Advantages: could provide transactional storage and isolation if separately designed.
- Risks: placeholder connection data only; PostgreSQL cutover is cancelled. No PDF/knowledge migration, table, schema, or pgvector contract exists. Production databases must not become a test registry.

### 4. SQLite Captain databases

- Evidence: `evidence/postgres_cutover_removal_20260629_151431.md`.
- Type: production authorities for Captain News and TradingView only.
- Advantages: proven for their stated workloads.
- Risks: unrelated schemas; no PDF knowledge contract or sandbox.

### 5. Obsidian/MCP

- Evidence: no Obsidian MCP configuration or canonical knowledge-registry contract is present in `AGENTS.md`, `docs/`, `captain_skill_os/`, `config/`, or repository MCP presets. `CLAUDE.md`, `knowledge/`, and `hermes/` are absent from this worktree.
- Risks: authority, schema, persistence, authentication, and test isolation cannot be verified.

## Ranking against required criteria

1. Filesystem Knowledge Base: only implemented knowledge-specific candidate; schema is partial and production/test roots remain undefined.
2. Generic HTTP handoff probe: isolation concept exists, but it is an unbound prototype.
3. PostgreSQL/pgvector: generic tooling only; no compatible schema and cutover disabled.
4. SQLite Captain databases: real production authority for unrelated domains.
5. Obsidian/MCP: no configuration evidence in this worktree.

No candidate satisfies all six criteria: existing production authority, schema compatibility, isolation/rollback, test availability, minimum change, and security/audit.

## Founder approval required

Approve or reject the filesystem Knowledge Base as canonical PDF knowledge authority. Approval must identify its production root, a physically separate sandbox root, the authoritative PDF record/frontmatter schema, authentication and authorization boundary, rollback procedure, and audit requirements. Until then, production/test namespaces, URL, and token remain intentionally undefined and canonical write remains disabled.
