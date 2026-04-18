# HANDOFF.md — v2-zero-fork branch

**Purpose:** any session (human, agent, subagent) reads this first. No context from memory, no inferred state. Current state lives here and in `git log`.

## Rules of engagement

1. **Read this file first. Read `git log --oneline -10` second.** That's the state.
2. **One task per commit.** Small, reviewable, bisectable.
3. **After each task:** update this file. Tick the box. Write the next concrete action.
4. **Before commit:** `pnpm test` must pass. Build only if shipping.
5. **If you get compacted mid-task:** do nothing weird on recovery — read this file, check git, resume from the next unchecked box.

## Branch: `v2-zero-fork`

## Status as of 2026-04-18 17:59 EDT

### ✅ Done and committed

- [x] `0cd5ab7` — Fix #1: separate onboarding from workspace shell (overlay stacking)
- [x] `35f0eb6` — Fix #2: guard root bootstrap from uncaught errors
- [x] `094feda` — Fix #3: zero-fork guards model switch via dashboard info
- [x] `4490598` — Fix #4: synthesize tool pills from inline dashboard stream markers
- [x] `9df67be` — Cleanup: remove duplicate `MODEL_SWITCH_BLOCKED_TOAST` import

All tests pass: **25/25** (`pnpm test`).

### ✅ Also done (Aurora, 18:02 EDT)

- [x] Verified `src/routes/api/model-info.ts` already removed (agent took care of it pre-compact)
- [x] Verified `routeTree.gen.ts` clean (no `api/model-info` references)
- [x] Full prod build green — `pnpm build` — client 6.19s / SSR 2.15s / 380 modules / 0 errors

### ⏳ Next up — in this order

- [x] **Browser QA on :3005** — hard-refresh, cleared localStorage, verified flows on 2026-04-18 18:25 EDT:
  1. **Onboarding:** expected standalone onboarding with no WorkspaceShell behind it, then shell after completion. **Observed:** pass — fresh load showed onboarding alone on a blank dark background; after `Skip setup`, normal shell/chat UI loaded. **Console:** no JS errors.
  2. **Model switch guard:** expected toast starting `Model switching requires the enhanced fork...` and no displayed model change. **Observed:** partial fail — selecting `Claude Opus 4.6` left the displayed model at `claude-opus-4-5` as expected, but no toast appeared in DOM or visually. **Console:** no JS errors.
  3. **Tool-call pill:** expected inline tool-call pill in assistant message after `fetch https://example.com`. **Observed:** partial pass — assistant completed with fetched Example Domain content and a visible `Snapshot` tool pill, but the pill rendered above the assistant response rather than clearly inline inside message text. **Console:** no JS errors.

- [x] **README v2 updates** — shipped (`9ec12a6`) — zero-fork banner + pip install upstream path everywhere fork was referenced

- [ ] **Tag and ship** — `git tag v2.0.0 && git push origin v2-zero-fork --tags` — only when browser QA is checked off.

### 🧊 Cold storage (do not touch unless explicitly asked)

- Memory browser already works via gateway `/api/memory/*`
- Sessions, streaming, config, skills all pass vanilla `pip install hermes-agent`
- Gateway runs zero-fork mode by default

## If you hit a wall

- **Rate-limited on openai-codex:** switch model with `hermes config set model anthropic-oauth/claude-opus-4-7` and restart the agent
- **Vite error in :3005 overlay:** read `/tmp/vite-3005.log`. Most errors are HMR hiccups that go away on file save
- **Tests fail:** do not commit. Report the failing test name and the observed vs expected in this file under a new "⚠️ Blockers" section

## Related tracks (do not work on from this branch)

- Hackathon entry: `hermes-promo` skill — lives at `/Users/aurora/.ocplatform/workspace/skills/hermes-promo/` (not created yet)
- Launch copy package: `/Users/aurora/.ocplatform/workspace/content/workspace-v2-launch/`
- Karborn visual refs: `/Users/aurora/.ocplatform/workspace/content/karborn-refs/`

## Contact

- Human: Eric
- Continuity file: this file + `git log`
- Last touched: 2026-04-18 17:59 EDT by Aurora (main session)
