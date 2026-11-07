# Port Registry — hermes-workspace host

> Single source of truth for port assignments on this Mac.
> Update this file whenever a service is added or moved.
> Last updated: 2026-10-11 (Model policy locked to ternary-bonsai-2-27b:q2_0 @8555 via Ollama proxy)

## Assigned (static)

| Port  | Service                          | Notes                                              |
|-------|----------------------------------|----------------------------------------------------|
| 3000  | Twenty CRM server (Docker)       | existing, keep                                     |
| 3001  | Hermes Workspace UI (`pnpm dev`) | dev server                                         |
| 3010  | **Buzz relay**                   | LIVE 2026-08-25, source build ~/srv/buzz, launchd-managed |
| 3100  | **Twenty staging**               | LIVE since 2026-08-25 (~/twenty/staging)           |
| 5432  | Buzz relay Postgres (Docker)     | loopback only; Twenty's db is container-internal   |
| 6379  | Buzz relay Redis (Docker)        | loopback only                                      |
| 8082  | Buzz Adminer (Docker)            | DB browser — consider disabling in prod migration  |
| 8108  | Buzz Typesense (Docker)          | search index                                       |
| 8180  | Buzz Keycloak (Docker)           | local OAuth testing                                |
| 9100/9101 | Buzz MinIO (Docker)          | remapped from 9000/9001 (Portainer conflict) via compose.override.yml |
| 8555  | **PRIMARY model — ternary-bonsai-2-27b:q2_0 Ollama proxy** | `ternary-bonsai-2-27b:q2_0` (Q2_0 ternary, 7.6GB) via Ollama on :11434, proxied by `ops/bin/gemma-server.sh` (locked 2026-11-03, `ops/config/model.env`) |
| 8642  | Hermes gateway API               | `API_SERVER_ENABLED=true`, loopback                |
| 8643  | Hermes night-qwen gateway        | profile `night-qwen` (legacy, now points to :8555) |
| 8644  | Hermes fleet-health-monitor gw   | profile `fleet-health-monitor`                     |
| 9119  | Hermes dashboard API             | zero-fork dashboard                                |
| 11434 | Ollama — PRIMARY backend         | `ternary-bonsai-2-27b:q2_0` (Q2_0 ternary, 7.6GB) — serves model for :8555 proxy |
| 1337  | Atomic Chat — RETIRED            | `AtomicChat/atomic-chat-gemma412-IQ4_XS`; retired 2026-09-18, rollback only |
| 3890  | Atomic Chat raw llama-server     | retired 2026-09-18 with the app, rollback only     |

## Observed dynamic / internal (do not assign)

| Port  | Process                    | Notes                                    |
|-------|----------------------------|------------------------------------------|
| 3471  | AtomicChat llama-server (legacy) | old atomic port — now :1337/:3890              |
| 49268 | Ollama internal            |                                          |
| 53299 | Unsloth embeddings server  | bge-small-en-v1.5 (ephemeral)            |
| 8000/9000/9443 | Portainer         | Docker management UI                     |
| 8888  | python3 (unidentified)     | investigate during Phase 1               |

## Rules

1. Never hardcode ports in scripts — read from `.env` / this registry.
2. New services must claim an unused static port here first.
3. Ephemeral ports are never referenced by scheduled jobs.