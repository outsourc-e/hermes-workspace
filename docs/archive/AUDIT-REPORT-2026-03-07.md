# ClawSuite Audit Report

Date: 2026-03-07

Scope reviewed:
- Key config: `package.json`, `tsconfig.json`, `vite.config.ts`, `electron/main.ts`, `electron/preload.ts`
- Full `src/` tree across routes, screens, components, hooks, stores, server utilities, and API handlers
- Supporting docs for stated product intent: `README.md`, `docs/ARCHITECTURE.md`, `docs/CLAWSUITE-ARCHITECTURE.md`

Limitations:
- `npm.cmd run build` could not complete in this sandbox because Vite/esbuild hit `spawn EPERM`, so bundle-size conclusions below are based on code structure, emitted `dist/` contents, polling patterns, and file/module size rather than a fresh production bundle.

## 1. Purpose

ClawSuite is a local-first control surface for OpenClaw/OpenClaw Gateway. It is trying to be more than a chat UI: chat, multi-session management, agent orchestration, file browsing/editing, terminal access, skills browsing, usage/cost analytics, browser automation, cron jobs, and a desktop shell all sit in one app.

The intended user is obvious from both docs and code: technical operators and self-hosting developers who run OpenClaw locally and want visibility and control over agents instead of a black-box SaaS interface. The README positions it as “mission control” rather than a chatbot, and the route surface backs that up: `/dashboard`, `/agents`, `/files`, `/terminal`, `/skills`, `/costs`, `/browser`, `/cron`, `/debug`, `/nodes`, `/channels`, `/sessions`, `/usage`, and a large gateway/agent-hub implementation.

The problem it solves is real: OpenClaw appears to expose a capable but infrastructure-heavy agent runtime, and ClawSuite wraps that runtime in a friendlier operator UI. The app is strongest where it translates raw gateway/state data into workflows a human can actually manage.

## 2. Architecture

### Stack

- TanStack Start + TanStack Router + React 19 for the app shell and file-based routes.
- Zustand for client state and TanStack Query for data fetching/caching.
- Tailwind CSS plus a homegrown theme/accent system.
- Electron wrapper plus a Tauri scaffold, though Electron is the active desktop path.
- Server-side helpers inside the same repo for auth, gateway RPC, terminal sessions, browser automation, cron, memory browser, etc.
- Gateway integration is mostly WebSocket RPC plus SSE fan-out.

### Patterns and design decisions

Good decisions:
- The repo-level separation is sensible: `routes/`, `screens/`, `components/`, `hooks/`, `stores/`, `server/`, `lib/`.
- The gateway client is centralized instead of every feature hand-rolling transport logic. `src/server/gateway.ts` has reconnect/backoff/heartbeat logic and a reusable RPC surface.
- Chat SSE is routed through a singleton event bus rather than N listeners per connected client, which is the right fix for duplicate streaming events. See `src/server/chat-event-bus.ts:1-9` and `src/server/chat-event-bus.ts:149-260`.
- File and memory APIs do explicit path normalization and traversal guards. See `src/routes/api/files.ts:33-40`, `src/routes/api/files.ts:227-340`, and `src/server/memory-browser.ts:31-40`.
- The terminal implementation uses a PTY helper instead of a fake output stream, which is more serious than the typical “demo terminal” approach. See `src/routes/api/terminal-stream.ts:11-120` and `src/server/terminal-sessions.ts:1-170`.

Questionable decisions:
- Too much privileged functionality lives inside the web app process. The app can install global packages, start background services, run git pulls, run `npm install`, browse arbitrary sites, proxy remote pages while stripping security headers, and expose filesystem reads/writes. That is fine for an admin console, but the code does not consistently behave like a hardened admin console.
- The front end has drifted into a monolith. `src/screens/gateway/agent-hub-layout.tsx` is 8,756 lines, `src/screens/chat/components/chat-composer.tsx` is 2,303 lines, `src/screens/chat/chat-screen.tsx` is 1,879 lines, and `src/routes/api/skills.ts` is 1,295 lines. Those are not “big files”; they are architecture failures.
- The design system is not actually enforced. The AGENTS guidance says dark-only and token-based colors, but the app supports `system` and `light`, and many screens use raw `bg-white`, `neutral-*`, hex values, and ad hoc color logic. See `src/hooks/use-settings.ts:5-47`, `src/hooks/use-settings.ts:94-128`, and `src/screens/costs/costs-screen.tsx:67-135`.
- There is duplication around terminal UI. Both `src/components/terminal-panel.tsx` and `src/components/terminal/terminal-panel.tsx` define a `TerminalPanel`, but only one is wired into the main chat shell. That is a codebase smell, not harmless redundancy.

## 3. What It Does Well

### The app has real product ambition, not a toy shell

The breadth is legitimate. This is not a fake “AI studio” with three placeholder tabs. The repo contains functioning flows for chat, sessions, files, memory, terminal, provider configuration, cron, usage analytics, and a desktop shell. The app surface is large because the product is large.

### Security thinking exists in several important places

- Electron renderer isolation is configured correctly: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` in `electron/main.ts:70-75`.
- Cloud webhook verification is properly HMAC-based with timing-safe comparison in `src/routes/api/cloud/webhook.ts:31-59` and enforced in `src/routes/api/cloud/webhook.ts:103-173`.
- Auth and JSON-content CSRF checks are applied broadly across the API surface.
- File and memory routes are not naively trusting user paths. `src/routes/api/files.ts:33-40` and `src/server/memory-browser.ts:31-40` are examples of practical hardening.

### The server-side gateway integration is better than the UI around it

`src/server/gateway.ts` is careful code. It handles handshake retries, reconnect backoff, heartbeats, request queuing, inflight tracking, and singleton reuse guards. That is the kind of infrastructure discipline missing from parts of the UI layer.

### The terminal implementation is more serious than expected

`src/server/terminal-sessions.ts:85-170` shows a real PTY-backed terminal model, with early-buffer handling, stream events, session lifecycle, and shutdown behavior. `src/routes/api/terminal-stream.ts:51-120` wraps it in an SSE stream cleanly. This is one of the more solid end-to-end features in the repo.

### The codebase has some genuinely thoughtful operator UX

The chat streaming/event dedup pipeline is overcomplicated, but it is overcomplicated in response to real gateway behavior, not because someone invented needless abstractions. The comments in `src/server/chat-event-bus.ts` and `src/stores/gateway-chat-store.ts` show the team actually fought race conditions and duplicate stream issues.

## 4. What It Does Poorly

### It overstates feature completeness

The README markets polished capabilities, but parts of the implementation are still soft, fallback-heavy, or unfinished. Browser status/tabs/screenshot endpoints simply cycle through multiple possible RPC names and treat “not implemented” as a normal compatibility outcome: `src/routes/api/browser/status.ts:19-35`, `src/routes/api/browser/tabs.ts:14-34`, `src/routes/api/browser/screenshot.ts:8-27`. The UI also contains direct “coming soon” behavior like `window.alert('Spawn Agent is coming soon.')` in `src/components/search/search-modal.tsx:170-177`.

This is not just marketing puffery. It makes the product harder to trust.

### The frontend is too monolithic to maintain safely

The biggest issue in the repo is not style. It is scale collapse.

- `src/screens/gateway/agent-hub-layout.tsx` at 8,756 lines is beyond reasonable reviewability.
- `src/screens/chat/components/chat-composer.tsx` at 2,303 lines is also beyond reasonable reviewability.
- `src/screens/chat/chat-screen.tsx` at 1,879 lines means the chat screen is still acting as an orchestration bucket.
- `src/routes/api/skills.ts` at 1,295 lines means a single API file is doing indexing, parsing, caching, feature grouping, and mutations.

At this size, local correctness stops mattering because global comprehension is gone.

### The design system is inconsistent and undisciplined

The codebase says “dark theme only” in local instructions, but the app still supports `light` and `system` in `src/hooks/use-settings.ts:5-47`, `src/hooks/use-settings.ts:94-128`. Screens like `src/screens/costs/costs-screen.tsx:67-135` and `src/screens/skills/skills-screen.tsx:90-103` use raw `bg-white`, `neutral-*`, and hardcoded chart hex values. This is not a token system anymore; it is a token system plus local exceptions everywhere.

### The PWA story is self-contradictory

The README sells installable PWA behavior. The root layout then unregisters every service worker and deletes every cache on boot in `src/routes/__root.tsx:264-280`. That is a legitimate workaround for stale deploys, but it also means the app has effectively chosen “never trust service workers” while still marketing PWA/offline behavior.

Pick one.

### Some privileged features are too dangerous for how casually they are exposed

- `/api/update-check` can run `git pull` and `npm install` from the app process: `src/routes/api/update-check.ts:179-218`.
- `/api/local-setup` can install OpenClaw globally and start the gateway: `src/routes/api/local-setup.ts:108-122`, `src/routes/api/local-setup.ts:189-220`.
- Electron IPC handlers can do the same in `electron/main.ts:134-169`.
- The browser subsystem launches Chromium with `--no-sandbox`: `src/server/browser-session.ts:51-58`.
- The browser proxy explicitly strips CSP and frame protections and disables TLS verification: `src/server/browser-proxy.ts:2-4`, `src/server/browser-proxy.ts:12-19`, `src/server/browser-proxy.ts:139-151`, `src/server/browser-proxy.ts:153-166`, `src/server/browser-proxy.ts:186-207`.

That is a lot of power for an app whose default auth posture is effectively “open if no password is configured.”

## 5. Code Quality

### Naming and organization

Top-level organization is good. Internal consistency is not.

Good:
- Folder structure is understandable.
- Many feature names map cleanly from route -> screen -> components -> hooks.

Weak:
- Duplication around terminal panel implementations muddies ownership: `src/components/terminal-panel.tsx:1-20` versus `src/components/terminal/terminal-panel.tsx:1-34`.
- There is too much cross-layer leakage. UI code reaches deep into transport and storage details because state boundaries are blurry.
- Generated route tree is dirty in git (`src/routeTree.gen.ts` modified) while the actual route architecture is large enough that generated artifacts should be tightly controlled.

### Types

Strict TypeScript is configured, which is good, but the repo cheats heavily around uncertain payloads.

- `src/types/recharts.d.ts:1-15` is basically a blanket `any` shim.
- `src/server/chat-event-bus.ts:51-95` and `src/server/chat-event-bus.ts:151-167` do a lot of `any`-driven parsing.
- `src/hooks/use-gateway-chat-stream.ts:199` casts a processed tool event as `any`.
- The broader search shows `any` scattered through chat, settings, usage, and gateway parsing.

The project gets the ergonomics of strict mode and the safety of loose mode. That is the worst combination.

### Component structure

Large parts of the UI are effectively page-sized state machines hidden inside components. `agent-hub-layout`, `chat-composer`, `chat-screen`, `chat-message-list`, and `files-screen` are too large to evolve safely.

### State management

The state model is mixed but not fully controlled:
- Zustand stores for persistent UI state.
- React Query for server data.
- Local component state for major flows.
- SSE event bus plus gateway store for chat streaming.

That is viable, but the chat area in particular has too many interacting state layers. The docs even acknowledge “4 competing state layers in chat.” The code backs that up.

## 6. Performance

### What looks good

- The terminal workspace is lazily loaded from the panel shell in `src/components/terminal-panel.tsx:1-11`.
- Query-based data fetching gives the app at least a chance to cache and de-dupe requests.
- The chat SSE singleton prevents N-times duplication per client and is the right architectural move.

### What looks bad

- Browser UI polls aggressively. `src/components/browser-view/BrowserPanel.tsx:178-191` polls status and tabs every 3 seconds in the background. Screenshot refresh is also query-driven. For a feature that may already be streaming or gateway-backed, that is expensive.
- Debug logging is left in hot paths. `src/hooks/use-gateway-chat-stream.ts:281`, `src/hooks/use-gateway-chat-stream.ts:298`, and `src/server/chat-event-bus.ts:133-159` all log stream activity. That adds noise and cost in active chat sessions.
- Several files are huge enough that they likely hurt incremental compile speed, editor responsiveness, and route chunking, even without a fresh bundle measurement.
- Costs screen hardcodes chart colors and pulls a fairly heavy chart surface into a route that is not obviously lazy-loaded beyond route boundaries: `src/screens/costs/costs-screen.tsx:112-134`.

### Bundle-size assessment

I could not complete a fresh production build because `npm.cmd run build` failed with Vite/esbuild `spawn EPERM` in this sandbox. So I cannot provide emitted chunk sizes. I can say the code structure suggests a heavy client:
- `recharts`
- `monaco`
- `xterm`
- `playwright`-related browser features
- multiple very large route files

Without aggressive route-splitting discipline, this app will trend large.

## 7. Security

### What is good

- Electron renderer hardening is decent: `electron/main.ts:70-75`.
- Webhook signature verification is good: `src/routes/api/cloud/webhook.ts:103-173`.
- File and memory traversal checks are real: `src/routes/api/files.ts:33-40`, `src/server/memory-browser.ts:31-40`.
- Most API routes do check `isAuthenticated` and many mutating routes also enforce `requireJsonContentType`.

### What is bad

#### 1. Auth defaults are weak

If `CLAWSUITE_PASSWORD` is unset, `isAuthenticated()` returns `true` for every request. See `src/server/auth-middleware.ts:94-108`. That means the app’s default posture is open access unless the operator remembers to configure a password.

#### 2. Session handling is too weak for an admin console

Session tokens are stored only in-memory in a process-local `Set` (`src/server/auth-middleware.ts:4-20`). That means:
- all sessions die on restart,
- there is no logout/session inventory/audit,
- horizontal scaling is impossible,
- and there is no durable trust model.

Cookies are `HttpOnly` and `SameSite=Strict`, which is good, but `Secure` is never set in `createSessionCookie()` (`src/server/auth-middleware.ts:114-120`).

#### 3. The app exposes admin-grade code execution/update paths

`/api/update-check` can run `git pull` and `npm install` from the app process: `src/routes/api/update-check.ts:179-218`. For a local-only dev tool this can be acceptable; for a UI-accessible admin endpoint guarded only by optional shared-password auth, it is risky.

`/api/local-setup` can globally install OpenClaw and launch the gateway: `src/routes/api/local-setup.ts:108-122`, `src/routes/api/local-setup.ts:189-220`.

Electron IPC duplicates similar behavior in `electron/main.ts:134-169`.

#### 4. Browser security is intentionally bypassed

This app contains a feature whose explicit behavior is to remove other sites’ framing and security headers:
- `src/server/browser-proxy.ts:2-4`
- `src/server/browser-proxy.ts:12-19`
- `src/server/browser-proxy.ts:153-166`
- `src/server/browser-proxy.ts:186-207`

It also sets `rejectUnauthorized: false` in outbound proxy requests at `src/server/browser-proxy.ts:139-151`. That is a serious footgun.

Separately, Playwright launches Chromium with `--no-sandbox` in `src/server/browser-session.ts:51-58`.

### Electron security model summary

Good:
- `contextIsolation`, `sandbox`, `nodeIntegration: false`
- preload bridge is narrow in `electron/preload.ts`

Bad:
- main process shells out with `shell: true` and global package install/start commands in `electron/main.ts:134-169`
- onboarding/install actions are still high privilege

## 8. Missing / Incomplete / Dead

### Missing or partial product surfaces

- Browser integration is compatibility-wrapper code around possibly-missing gateway methods, not a fully trustworthy feature yet. `src/routes/api/browser/status.ts`, `src/routes/api/browser/tabs.ts`, and `src/routes/api/browser/screenshot.ts` all treat “not implemented” as a normal branch.
- Search modal contains a literal “Spawn Agent is coming soon” placeholder: `src/components/search/search-modal.tsx:170-177`.
- `src/screens/gateway/gateway-placeholder.tsx:4-10` is dead weight right now. I did not find active usage, which suggests unfinished UI branches or abandoned scaffolding.
- `src/routes/api/-diagnostics.ts` is explicitly a stub placeholder from the earlier search pass.

### Dead or drifting code

- Duplicate terminal panel implementations suggest unfinished refactors.
- A Tauri app scaffold exists (`src-tauri/`) while Electron is the actual active desktop implementation. That might be future-proofing, or it might just be project drift.
- The README and architecture docs still contain “coming soon,” “in development,” and older architecture assumptions that no longer match the exact implementation surface.

### Test coverage is thin

Only four test files are present in `src/`:
- `src/components/workspace-shell.test.ts`
- `src/components/onboarding/onboarding-tour.test.ts`
- `src/server/providers.test.ts`
- `src/server/usage-cost.test.ts`

For a codebase this large and stateful, that is nowhere near enough.

## 9. Top 10 Improvements

1. Remove or heavily lock down self-update and installer endpoints.
   Files: `src/routes/api/update-check.ts:179-218`, `src/routes/api/local-setup.ts:108-122`, `src/routes/api/local-setup.ts:189-220`, `electron/main.ts:134-169`
   Reason: These endpoints effectively give the UI package-install and update powers. At minimum, restrict them to Electron-only local flows, require an explicit high-trust mode, and log/audit every invocation.

2. Replace optional/shared-password auth with a real admin auth model.
   Files: `src/server/auth-middleware.ts:4-20`, `src/server/auth-middleware.ts:94-120`
   Reason: Default-open auth is not acceptable for an app that can modify files, start services, and run updates. Require auth by default, persist sessions properly, add secure cookie handling, and consider loopback-only bypass if absolutely needed.

3. Break up `agent-hub-layout.tsx` immediately.
   Files: `src/screens/gateway/agent-hub-layout.tsx:1`, `src/screens/gateway/agent-hub-layout.tsx:8408-8460`
   Reason: At 8,756 lines, this file is past maintainable. Split by tab/area: mission builder, live output, approvals, providers, reports, overlays, and shared hooks.

4. Break up chat composition and chat screen orchestration.
   Files: `src/screens/chat/components/chat-composer.tsx:1`, `src/screens/chat/components/chat-composer.tsx:1696-1735`, `src/screens/chat/chat-screen.tsx:1`
   Reason: The chat surface is central to the product and currently too large to reason about safely. Extract attachment handling, mobile composer, model controls, and streaming UI state.

5. Stop deleting service workers and caches on every boot, or stop claiming full PWA support.
   Files: `src/routes/__root.tsx:264-280`
   Reason: The current behavior undercuts installability/offline expectations. Fix the stale-asset problem correctly instead of globally disabling the web-app model.

6. Simplify and formalize gateway payload typing.
   Files: `src/server/chat-event-bus.ts:51-95`, `src/server/chat-event-bus.ts:151-167`, `src/hooks/use-gateway-chat-stream.ts:187-257`, `src/types/recharts.d.ts:1-15`
   Reason: Too much `any` is hiding protocol risk. Add proper schemas/parsers for gateway events and replace ad hoc shims with real types.

7. Remove browser security bypasses from the default product path.
   Files: `src/server/browser-session.ts:51-58`, `src/server/browser-proxy.ts:2-4`, `src/server/browser-proxy.ts:139-151`, `src/server/browser-proxy.ts:153-166`, `src/server/browser-proxy.ts:186-207`
   Reason: `--no-sandbox`, stripped CSP/frame protections, and `rejectUnauthorized: false` are all high-risk defaults. If this feature remains, it needs an explicit “unsafe local dev mode” boundary.

8. Enforce the design system instead of just documenting it.
   Files: `src/hooks/use-settings.ts:5-47`, `src/hooks/use-settings.ts:94-128`, `src/screens/costs/costs-screen.tsx:67-135`, `src/screens/skills/skills-screen.tsx:90-103`
   Reason: Decide whether ClawSuite is dark-only or multi-theme. Decide whether colors are tokenized or not. Then enforce it via lint rules or component primitives.

9. Remove duplicated terminal UI paths and standardize on one implementation.
   Files: `src/components/terminal-panel.tsx:1-20`, `src/components/terminal/terminal-panel.tsx:1-34`
   Reason: Duplicate panel implementations create drift and wasted maintenance. Keep the store-driven/lazy-loaded version if that is the current direction and delete the older branch.

10. Add meaningful test coverage around privileged and stateful flows.
    Files: `src/routes/api/update-check.ts`, `src/routes/api/local-setup.ts`, `src/server/gateway.ts`, `src/server/chat-event-bus.ts`, `src/screens/chat/*`, `src/screens/gateway/*`
    Reason: Four small tests are not enough for this surface area. The missing coverage is highest exactly where the app is most privileged and most complex.

## 10. Bottom Line

ClawSuite is a serious operator product with real utility. The repo contains enough working infrastructure to prove that. The gateway transport, file/memory safeguards, terminal plumbing, and several server-side utilities are solid.

But the codebase is drifting in two dangerous directions at once:
- product claims are running ahead of actual polish/completeness,
- and UI complexity is outrunning maintainability.

The next phase should not be “add more tabs.” It should be hardening, decomposition, and reducing the number of places where this app behaves like an unaudited local admin shell.

## Verification Notes

- `npm.cmd run build` failed in this sandbox with Vite/esbuild `spawn EPERM`, so no fresh emitted bundle metrics were available.
- `npx tsc --noEmit` was still run separately after writing this report.
