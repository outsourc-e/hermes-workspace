# Hermes Workspace Windows stack

This directory is the version-controlled source of truth for the local Windows
runtime currently deployed under `%LOCALAPPDATA%\hermes`.

## Contents

- `stack-supervisor/` — single-instance supervisor, Scheduled Task installer,
  launcher, and lifecycle tests.
- `antigravity-relay/` — loopback OpenAI-compatible Antigravity OAuth relay and
  tests.
- `deploy.ps1` — copies the four runtime files into `%LOCALAPPDATA%\hermes`
  without deleting logs, caches, model inventory, status, or other runtime
  state, then runs the idempotent Scheduled Task installer.

Generated runtime state is intentionally not versioned. In particular, do not
copy OAuth settings, model caches, logs, status files, lock files, or provider
output into this directory.

The installer resolves only explicit validated executable candidates. The
current Windows deployment requires Python 3.12 (including `pythonw.exe` and
`psutil`), Node/npm, the managed Hermes executable, and
`%LOCALAPPDATA%\agy\bin\agy.exe`; it does not fall back to `PATH` discovery.
The relay `/health` endpoint reports local relay readiness without consuming an
Antigravity job slot. Provider inventory and its persisted non-secret cache are
owned by `/v1/models`.

## Verify

From this directory:

```powershell
python -m unittest discover -s antigravity-relay\tests -p test_relay.py -v
python -m unittest discover -s stack-supervisor\tests -p test_supervisor.py -v
python -m py_compile antigravity-relay\relay.py stack-supervisor\supervisor.py
```

## Deploy

Preview the copy targets:

```powershell
.\deploy.ps1 -WhatIf
```

Deploy and register/start `Hermes_Workspace_Stack`:

```powershell
.\deploy.ps1
```

Use `-SkipInstall` only when updating files without re-registering the task.
The running supervisor must still be restarted before Python source changes are
loaded into memory.
