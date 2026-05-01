# Hermes Workspace Desktop Update System

This branch introduces the update contract that the DMG/EXE packaging should use.

## Products

Hermes ships two separately updateable products:

1. **Hermes Workspace**: the UI/server shell.
2. **Hermes Agent**: the local agent/gateway runtime.

They must not be modeled as two remotes in the same git checkout. The Workspace updater updates Workspace. The Agent updater updates the installed/bundled Agent.

## API

- `GET /api/update/status`
  - returns Workspace + Agent version/install/update state.
- `POST /api/update/workspace`
  - applies a Workspace update only when safe.
- `POST /api/update/agent`
  - applies an Agent update only when safe.

## Install kinds

Current implementation detects:

- `git`: development/source checkout.
- `docker`: running in container, update is not applied in-process.
- `desktop`: reserved for DMG/EXE auto-updater integration.
- `unknown`: cannot safely update automatically.

## Git/dev behavior

For git installs:

- Workspace updates use `origin/<branch>` and require a clean, fast-forwardable checkout.
- Agent updates call the Agent's own `hermes update` command and require a clean Agent checkout.
- Dirty or non-fast-forward states are blocked and surfaced as review-required, not as a copy-command primary path.

## Desktop behavior to wire next

The packaged app should set `HERMES_WORKSPACE_DESKTOP=1` and provide a desktop updater bridge that:

1. Checks a signed update manifest or GitHub Release.
2. Downloads the Workspace app update through Electron auto-updater or equivalent.
3. Updates the bundled Hermes Agent payload separately.
4. Restarts Workspace + Agent after update.
5. Stores release notes for the first screen after update.

The UI already expects product-level update status and release notes, so the desktop bridge should map into the same `/api/update/*` contract.
