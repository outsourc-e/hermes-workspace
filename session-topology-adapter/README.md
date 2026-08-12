# Session Topology Adapter

A Python-standard-library sidecar that projects compact session relationship facts from live Hermes SQLite persistence. It supports persistence schema version **23 only** and returns `409 {"error":"schema_incompatible"}` without projecting rows when the schema marker is missing, malformed, duplicated, or unsupported.

## Live read-only database contract

Compose intentionally mounts `hermes-agent-data` at `/data` **writable**. SQLite readers need directory write permission to coordinate live WAL/SHM state, but that mount permission does not authorize database-content writes. The adapter:

- opens the data/profile directory chain component-by-component on Linux with held `O_DIRECTORY|O_NOFOLLOW` handles, opens `state.db` with `O_NOFOLLOW`, and gives SQLite only the pinned `/proc/self/fd/<fd>` identity through a URI with `mode=ro`;
- verifies SQLite's reported main database device/inode against the held descriptor and revalidates the selected profile directory and `state.db` namespace entries before accepting the connection;
- immediately enables and verifies `PRAGMA query_only=ON`;
- installs a SQLite authorizer that permits only the required read/schema operations and cannot disable `query_only`;
- wraps table-info, schema-version, and session reads in one explicit read transaction, with only `BEGIN`, `COMMIT`, and failure-path `ROLLBACK` transaction operations authorized;
- uses explicit SQL `LIMIT` bounds for schema-version and session reads, plus snapshot admission and row-count bounds;
- streams session rows incrementally under the same explicit read transaction, gates oversized cells in SQL before returning them to Python using the smaller of the scalar and aggregate snapshot byte ceilings, and enforces cumulative source/object and projection byte budgets while materializing records;
- reads committed WAL frames through normal SQLite locking and never uses `immutable=1`;
- checks SQLite's reserved lock byte instead of inferring transaction state from journal contents, permits completed PERSIST and stale/malformed non-hot journal reads through SQLite itself, retries three times, and returns a safe `503` while a rollback transaction remains active;
- never creates a database copy or applies a database-file byte cap; and
- bounds retained snapshots by aggregate row and conservatively measured Python-object byte budgets, rejects oversized persisted scalars, and explicitly expires cursors whose snapshots were evicted.

The container still has a read-only root filesystem and runs as UID/GID `10010:10010` with all capabilities dropped and `no-new-privileges`. It publishes no host port and is attached only to an internal Compose network.

## Runtime

Required environment:

- `SESSION_TOPOLOGY_ADAPTER_TOKEN`: non-empty bearer token.

Optional environment:

- `SESSION_TOPOLOGY_ADAPTER_DATA_DIR` (default `/data`)
- `SESSION_TOPOLOGY_ADAPTER_HOST` (default `0.0.0.0`)
- `SESSION_TOPOLOGY_ADAPTER_PORT` (default `8080`)
- `SESSION_TOPOLOGY_ADAPTER_SNAPSHOT_TTL_SECONDS` (default `60`)
- `SESSION_TOPOLOGY_ADAPTER_MAX_SNAPSHOTS` (default `32`)
- `SESSION_TOPOLOGY_ADAPTER_MAX_SNAPSHOT_ROWS` (default `50000`)
- `SESSION_TOPOLOGY_ADAPTER_MAX_CACHED_SNAPSHOT_ROWS` (default `100000`)
- `SESSION_TOPOLOGY_ADAPTER_MAX_CACHED_SNAPSHOT_BYTES` (default `67108864`)
- `SESSION_TOPOLOGY_ADAPTER_MAX_SCALAR_BYTES` (default `65536`, measured as UTF-8 bytes for text)
- `SESSION_TOPOLOGY_ADAPTER_MAX_CONCURRENT_SNAPSHOTS` (default `1`)

Routes:

- `GET /health` — unauthenticated liveness only.
- `GET /ready` — unauthenticated persistence readiness. It returns only `200 {"status":"ready"}` after the schema-23 default live database passes the same read-only, admission, rollback-journal, row, and projection checks as a topology snapshot. It returns only the non-sensitive `503 {"status":"unavailable"}` when persistence is not ready and never caches or returns session rows.
- `GET /v1/session-topology` — requires the configured bearer token in the `Authorization` header; accepts `profile`, `limit`, `cursor`, and `snapshot` query parameters.

The default database is `/data/state.db`. A validated named profile uses `/data/profiles/<profile>/state.db`. Pagination cursors are opaque, authenticated, snapshot-bound, and expire explicitly. Responses expose only the documented topology allowlist; raw model configuration, prompts, messages, metadata, working directories, and credentials are never returned or logged. The adapter has no persistence write endpoint.

## Compatible producer identity

Compose pins Hermes Agent **v0.19.0**, upstream revision
`fa7b0fcf5d6e3576a59514ef1e281cd1e0872b8b`, at the immutable image identity
`nousresearch/hermes-agent@sha256:606a3b445ed7b963d63b1d96283e97c43c350eebf4f69abfb7fdfc3e2d7b7f56`.
The compatibility claim is limited to the image selected for the CI runner
platform. The verifier does not claim packaged-schema parity across every
platform manifest. It pulls exactly that digest without starting it, checks the
OCI revision label and packaged version, and validates the packaged schema
version and required `sessions` columns before the adapter can pass CI.

## Tests

```sh
python3 -m unittest discover -s session-topology-adapter/tests -v
```
