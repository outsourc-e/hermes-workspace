# HermesWorld Master Roadmap

Status: active build sprint
Owner: Eric / Aurora
Repo: `outsourc-e/hermes-workspace`
Scope: HermesWorld inside Hermes Workspace, dashboard/plugin embedded first, standalone later

## Product thesis

HermesWorld is no longer a novelty route. It is the playable layer for Hermes Workspace: a persistent world where humans and agents can move, talk, complete missions, unlock progression, and eventually keep working while the human is away.

Keep HermesWorld in `hermes-workspace` for now. The tight coupling to workspace state, sessions, agents, plugins, quests, and dashboard embeds is the feature. A standalone destination can ship as a route/deploy target later without splitting source.

## North star

HermesWorld should become:

- **playable by humans**: polished RPG/MMO onboarding, chat, quests, inventory, progression, multiplayer presence
- **operable by agents**: deterministic action verbs, quests, travel, equipment, combat/evals, offline progression
- **persistent**: durable player profiles, world events, analytics, session handoff, reconnect truth
- **dashboard-embeddable**: first-class private/admin and public embed surfaces
- **standalone shareable**: public landing/deep links when the product surface is ready

## This week, shipping track

### 1. Admin UX cleanup

Ship a dashboard/plugin-only admin surface for Eric. Do not put admin controls on the public loading page.

Deliverables:

- Private admin route/panel gated to local/private access and admin token.
- Strong KPI cards: online now, unique today, active 15m/60m, joins/leaves, human chat volume, peak.
- Recent players with world, last seen, last chat, join/chat counts.
- Recent events with clear type styling and world labels.
- Human vs NPC truth called out explicitly. Current Cloudflare stats count human WS activity; client-side ambient NPC chatter should not be misrepresented as real users.
- Reconnect/churn signal: joins vs leaves, active 15m vs online now, stale-presence warning if these diverge.

Acceptance criteria:

- Eric can open the admin surface from a private/dashboard context and immediately understand live health.
- Stats do not pretend bots are humans.
- Recent player/event lists are scannable at a glance.

### 2. Visual polish pass

Execute `docs/hermesworld/visual-upgrade-spec.md` aggressively. TinySkies is the atmosphere/environment reference, not the code architecture.

Deliverables:

- Zone-specific camera/lighting/fog/sky tuning.
- Landmark emphasis in every zone.
- More readable paths and objective direction.
- Denser low-poly props without clutter.
- HUD/chat/nameplates move from dev-tool glass to premium game UI.
- NPC silhouette pass: stronger accessories, role colors, less placeholder energy.

Acceptance criteria:

- Screenshots look meaningfully more premium before any explanation.
- Each zone reads from one frame.
- The player sees where to go without reading a paragraph.

### 3. Chat / NPC cleanup

Deliverables:

- Reduce ambient NPC message flooding.
- Separate human chat from ambient/NPC chatter in the UI.
- Label local fallback/bot presence honestly.
- Keep multiplayer chat useful for humans, not drowned by scripted lines.

Acceptance criteria:

- Human messages are visually dominant.
- NPC flavor adds life but does not spam.
- Admin metrics and chat labels use truthful language.

### 4. Plugin/embed hardening

Deliverables:

- Dashboard plugin and Hermes Workspace plugin remain first-class.
- `embed=1` mode stays clean and chrome-free where appropriate.
- Plugin install flow remains git-based and obvious.
- Admin stays private/plugin-only.

Acceptance criteria:

- Public users see the world, not admin machinery.
- Dashboard users can embed/control without layout weirdness.

## Medium-term architecture

### Agent action layer

Build a deterministic world API that both the human UI and agent runtime can use. Avoid UI hacks like clicking DOM nodes from an agent.

Initial action verbs:

- `move_to(target | x,z)`
- `talk_to(npcId)`
- `accept_quest(questId)`
- `complete_objective(questId, objectiveId)`
- `equip(itemId)`
- `travel(worldId)`
- `attack(targetId)`
- `loot(itemId | targetId)`
- `rest()`

Design requirements:

- Every action is validated server-side or by a shared deterministic state machine.
- Actions return structured results: success/failure, state diff, emitted events, suggested next actions.
- Human UI should call the same action layer where possible.
- Agents should be able to plan from world state, not screenshots.

### Progression and persistence

Medium-term progression model:

- XP/level/title progression.
- Quest chains per zone.
- Inventory/equipment affecting verbs.
- Unlockable travel gates.
- World event log.
- Durable profile storage beyond localStorage.

Persistence stages:

1. localStorage profile, current
2. dashboard/plugin-backed profile sync
3. account/session-backed cloud profile
4. offline activity workers for agent progress

### Analytics truth model

Move from rough counters to a crisp event model:

- human presence events
- human chat events
- NPC ambient events, separate stream
- agent action events
- reconnect/session churn events
- quest/progression events
- combat/eval events

Admin should expose both live state and event-derived trends.

## Longer-term agent-world design

### Agent takeover

The user can hand control to an agent. The agent receives:

- player profile
- current zone and position
- active quests/objectives
- inventory/equipment
- nearby interactables/NPCs
- allowed verbs
- risk/approval policy

The agent emits actions, not UI clicks.

### Offline progression

When the user sleeps, their agent can keep progressing inside bounded rules:

- user-configured goal, for example `level to 5`, `finish Training Grounds`, `farm Forge shards`
- max time/resource budget
- safe action allowlist
- summarized event log on return
- no irreversible marketplace/public actions without approval

### Agent-to-agent combat / battle loop

Future battle loop should reuse eval concepts:

- arena match = structured task/eval
- agents choose abilities/tools/models
- scoring combines objective result, speed, cost, style/quality
- loot/rewards map back to workspace abilities or cosmetics

This makes HermesWorld a visible layer for agent benchmarking and learning, not just a toy combat system.

## Implementation order

1. Admin panel cleanup and truthful metrics labels.
2. Chat/NPC flood reduction and separation.
3. Visual atmosphere constants and HUD material pass.
4. Landmark/path readability pass per zone.
5. Shared action-layer spec in code (`lib/playground-actions.ts`) with types first.
6. Wire one real action path through the type layer, likely `travel` or `equip`.
7. Standalone landing surface once the embedded product feels premium.

## Open risks

- Cloudflare relay analytics are useful but still approximate if tabs hibernate/reconnect aggressively.
- Local bot/NPC activity can make the world feel alive, but must never pollute human metrics.
- Visual richness must stay lightweight, no giant asset pipeline yet.
- Agent-playable systems need deterministic state transitions before autonomy, otherwise agents will become brittle screen-clickers.
