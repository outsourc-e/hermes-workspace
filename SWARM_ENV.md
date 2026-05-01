# SWARM_ENV.md

Canonical environment contract for Swarm / Swarm2 work.

## One true repo

- **Swarm code, git, build, and tests run only in:** `/Users/aurora/hermes-workspace`
- **Do not use:** `/Users/aurora/hermes-workspace`

If you detect `hermes-workspace`, stop and switch to the canonical repo.

## Memory vs code

- **Memory / handoffs root:** `/Users/aurora/.openclaw/workspace`
- **Daily notes + handoffs writable path:** `/Users/aurora/.openclaw/workspace/memory`
- Use the memory root for notes and handoffs only, not for app code builds.

## Worker runtime model

- Workers are **Hermes profiles** under `~/.hermes/profiles/<workerId>`
- Wrappers are **canonical launch points** at `~/.local/bin/swarmN`
- One persistent tmux session per worker, named **`swarm-<workerId>`**
- `/swarm2` should attach to the same live session the worker is already using
- Prefer live tmux delivery over one-shot subprocesses

## Machine-readable source of truth

Do not guess layout from random filesystem probes when the API can answer it.
Use:

- `/api/swarm-environment`
- `/api/swarm-runtime`
- `/api/swarm-health`
- `/api/swarm-project`
- `/api/swarm-chat`
- `/api/swarm-decompose`
- `/api/swarm-dispatch`
- `/api/swarm-tmux-start`
- `/api/swarm-tmux-stop`
- `/api/swarm-tmux-scroll`

## Default commands

```bash
cd /Users/aurora/hermes-workspace && npm run build
cd /Users/aurora/hermes-workspace && npm test -- src/screens/swarm2
cd /Users/aurora/hermes-workspace && PORT=3002 npm run dev
```

## Writable roots

- `/Users/aurora/hermes-workspace`
- `/Users/aurora/.openclaw/workspace/memory`

## Read-only roots

- `/Users/aurora/.openclaw/workspace`
- `~/.hermes/profiles`
- `~/.local/bin`

## Forbidden roots

- `/Users/aurora/hermes-workspace`

## Rule of thumb

If a choice is ambiguous, ask:

> What is the one true process/session this worker is running in, and what is the one true repo for the UI surface?

Answer:
- process/session → live Hermes worker in tmux `swarm-<workerId>`
- repo → `/Users/aurora/hermes-workspace`
