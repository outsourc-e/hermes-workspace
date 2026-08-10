# Subscription-only orchestration

Hermes Workspace exposes subscription-backed orchestration controls under **Settings → Orchestration**. The feature deliberately keeps API-billed transports hidden unless the user explicitly enables them.

## Routes and precedence

Model selection uses canonical references such as:

- `claude-cwm4tx/sonnet`
- `claude-gp/opus`
- `openai-codex/gpt-5.6-sol`

The effective child route follows this order:

1. Explicit `model` on a delegation task
2. Named `worker` preset
3. Session override
4. Global default child
5. Existing safe Hermes default

Changing a model in a chat writes a browser-local session override. `ChatScreen` reads that exact canonical route and sends it as the request `model`; it does not rewrite the global Hermes model. A new chat keeps the override under `new` until Hermes resolves the real session key, then migrates it to that session. Global defaults are changed only from Orchestration settings.

## Configure any OAuth route in any role

All role selectors consume one canonical OAuth subscription registry. A route identifies both the authenticated account/transport and the model, so the two Claude Max accounts remain deterministic rather than being collapsed into one `claude` provider.

The shared registry is available in:

- **Chat → Chat controls → Model** for the current conversation
- **Settings → Orchestration → Orchestrator model**
- **Settings → Orchestration → Default child model**
- **Settings → Orchestration → Fallback chain**
- **Settings → Orchestration → Named workers**
- **Settings → Orchestration → Swarm role assignments** for every existing semantic role
- **Swarm → Add Swarm → Model** for newly created roles

To change an existing Swarm role, open **Settings → Orchestration**, choose a canonical route beside the role, and click **Apply role assignments**. The saved route is synchronized into that worker profile before its next start or dispatch-created session. A worker that is already running must be restarted to load the new profile model. The worker-card settings panel displays the effective runtime model but does not offer a misleading local-only model override. Legacy free-text assignments remain visible until replaced; an unresolved legacy or default `Worker` label leaves the existing profile model untouched instead of blocking startup. New assignments are validated against the canonical OAuth registry.

Runtime ownership is explicit:

- **Orchestrator model** synchronizes to Hermes top-level `model.provider` and `model.default`.
- **Default child model** synchronizes to `delegation.provider` and `delegation.model`.
- **Swarm Router decomposition** uses `orchestratorModelRef`, then the default child route when no parent override exists. Request overrides must match a selectable canonical OAuth route.
- **Swarm workers** resolve their canonical roster route into the worker profile before a new live session starts.

Swarm worker execution requires `tmux`. On Windows, use the native ConPTY port: `winget install --id arndawg.tmux-windows`. Workspace creates an interactive Git Bash pane and sends the Hermes command into it; it does not use WSL or duplicate OAuth credentials. On macOS use `brew install tmux`; on Debian/Ubuntu use `sudo apt install tmux`.

The canonical OAuth assignment is synchronized into each generated worker profile before the tmux-backed Hermes process starts. tmux is only the persistent process/pane transport; it does not authenticate providers or store OAuth material. Native Windows tmux does not support Workspace's Unix-style `new-session -c` usage, so the Windows launch plan changes directory inside the pane instead. Unix wrapper files under `~/.local/bin` are not required on Windows; profiles bootstrap from the active `HERMES_HOME`.

Changing a route assigned to an already-running worker requires stopping and starting that worker. The next launch reads the synchronized profile; an active Hermes TUI does not hot-swap its model transport.

The normal route states are:

- `available`: selectable
- `quota_limited`: visible with a warning but disabled until quota becomes available
- `auth_expired` or `unavailable`: visible but disabled
- unvalidated CLI transports: reported in transport status but do not publish selectable model routes

OpenAI Codex and Nous models are discovered with the Python interpreter from the managed Hermes installation, not an unrelated system Python. This keeps the dashboard catalog aligned with the models the installed Hermes runtime can actually resolve.

The live catalog endpoint is `GET /api/orchestration-catalog`. Existing Swarm role updates use `PATCH /api/swarm-roster` with `{ "id": "<worker>", "modelRef": "<canonical-route>" }`; the endpoint rejects unknown, disabled, or API-billed routes.

## Defaults

- Active child agents globally: 3
- Active jobs per subscription account: 1
- Delegation depth: 2
- Total live agents: 8
- Child memory: shared read/write
- Child writes: parent review queue
- Context transfer: full conversation
- Context overflow: compact to a valid recent conversation boundary and notify
- Interactive quota exhaustion: display the limited route and offer alternatives
- Unattended quota exhaustion: configured subscription fallback chain
- API-billed models: hidden and disabled
- Auxiliary paid fallback: disabled while the API-billing gate is closed

Pending child memory writes can be reviewed through the existing Hermes memory pending/approve/reject workflow.

## Why one job per subscription account

Vendors do not publish numeric concurrent-CLI process limits. The default queues work per account to avoid accidental subscription-window bursts while still allowing separate authenticated accounts to run concurrently.

- Claude Max usage is shared across Claude surfaces and has five-hour and weekly windows.
- Codex local and cloud activity share rolling usage windows and may have weekly limits.
- Gemini Ultra publishes daily request capacity, but not a numeric per-minute concurrency cap; one prompt can consume multiple requests.
- Nous Portal does not publish numeric concurrency or reset limits.
- Copilot documents temporary fair-use limits but not a numeric concurrency cap.

The per-account setting is configurable, but increases should be based on ordinary observed work rather than synthetic burst tests.

Official references:

- Claude Max: https://support.claude.com/en/articles/11049741-what-is-the-max-plan
- Claude Code subscription use: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- OpenAI Codex pricing and limits: https://developers.openai.com/codex/pricing/
- Gemini CLI quota: https://geminicli.com/docs/resources/quota-and-pricing
- Nous Portal: https://hermes-agent.nousresearch.com/docs/integrations/nous-portal
- GitHub Copilot limits: https://docs.github.com/en/copilot/concepts/usage-limits

## Quota behavior

Quota-limited models stay visible with warnings and a reset timestamp when the provider exposes one. The user can choose:

- Configured subscription fallback
- Stop and notify
- Wait until a known reset time

A wait policy does not busy-poll. If no reset time is known, Hermes cannot safely schedule a wait and must notify instead.

Explicitly selected routes are not silently replaced. Automatic fallback is for configured unattended work.

## Security and billing boundaries

- Claude Max uses the local first-party Claude CLI relay. Hermes' native Anthropic API/Extra Usage route is not used.
- OpenAI Codex uses ChatGPT OAuth, not `OPENAI_API_KEY`.
- Nous Portal routes use Nous OAuth. Their individual entitlement and bundled usage may vary by subscription, so the dashboard retains the `subscription_unknown` warning rather than representing them as API-key routes.
- Gemini, when enabled, must use Gemini CLI Google OAuth rather than API keys or Vertex billing.
- Additional Usage, Anthropic Extra Usage, and API-key fallbacks remain disabled unless deliberately enabled outside the default policy.
- Account tokens and OAuth files are never copied into Workspace policy files.
- Policy changes, Swarm roster changes, Swarm decomposition, and Swarm dispatch require the local-or-auth request boundary. Enabling API-billed routes additionally requires the explicit billing confirmation field.
- An explicitly configured gateway token takes precedence over localhost-only discovery of the co-located Hermes `API_SERVER_KEY`.

## Policy storage

- Global policy: `%HERMES_HOME%/workspace/orchestration-policy.json`
- Session overrides: `%HERMES_HOME%/workspace/orchestration-sessions.json`
- Runtime translation: selected global fields are synchronized into `%HERMES_HOME%/config.yaml`

The JSON policy stores route names and behavior only, never credentials.

## Verification

From the Workspace repository:

```bash
npx vitest run src/server/subscription-model-catalog.test.ts src/server/swarm-model-resolver.test.ts src/server/swarm-roster.test.ts src/server/swarm-decompose-model.test.ts src/server/orchestration-hermes-sync.test.ts src/server/__tests__/gateway-capabilities.test.ts src/routes/api/-orchestration-policy.test.ts src/routes/api/-swarm-dispatch-auth.test.ts src/routes/api/-swarm-dispatch.test.ts src/screens/swarm2/swarm2-screen.test.ts src/screens/swarm2/operational-worker-card-model.test.ts src/components/settings-dialog/settings-dialog-orchestration.test.ts src/routes/api/__tests__/-models.test.ts src/screens/chat/components/chat-composer-model-switch.test.ts
npm run build
node .hermes/verify-oauth-role-ui-readonly.mjs
```

The browser check is read-only. It verifies that account-specific Claude routes and OpenAI Codex appear in the Chat picker, every Orchestration role selector, every existing Swarm role selector, and the new Swarm-role picker.
