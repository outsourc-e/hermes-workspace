# HermesWorld Lane B Gameplay Systems Boundaries

Status: implementation contract for parallel swarm workers
Scope: quest, event, NPC state, inventory, rewards, and agent-action APIs
Source: `docs/hermesworld/SWARM-GAME-ARCHITECTURE.md`

## Goal

Make the game loop feel real without creating a giant shared branch. Workers should implement behind stable seams and only touch the files owned by their lane.

## Ownership map

| System | Owner files | May import from | Must not own |
| --- | --- | --- | --- |
| Contracts | `src/screens/playground/lib/gameplay-contracts.ts` | none / type-only | Runtime state mutation |
| Quest engine | `src/screens/playground/lib/quest-engine.ts`, quest tests | `gameplay-contracts`, static quest data | React hooks, NPC copy, inventory UI |
| Event bus/log | `src/screens/playground/lib/gameplay-events.ts`, event tests | `gameplay-contracts` | Quest definitions, reward calculations |
| NPC state/dialog | `src/screens/playground/lib/npc-state.ts`, `npc-dialog.ts` | `gameplay-contracts`, event emitters | Inventory mutation, reward granting |
| Inventory/rewards | `src/screens/playground/lib/inventory-rewards.ts`, reward tests | `gameplay-contracts`, item data | Quest completion decisions, NPC dialog text |
| Agent actions | `src/screens/playground/lib/agent-actions.ts`, API route stubs later | `gameplay-contracts`, event bus | Prize oracle, direct secrets, UI orchestration |
| React integration | `src/screens/playground/hooks/use-playground-rpg.ts` | all service modules | New business rules once extracted |

Rule: static content can live in `playground-rpg.ts`/`npc-dialog.ts`; game rules should move into small pure modules with tests.

## Runtime boundary

Use one reducer-style state transition path:

1. UI/NPC/agent produces a `GameplayEvent` or `AgentActionRequest`.
2. Event/action validates against current `GameplayStateSnapshot`.
3. Pure system returns a `GameplayPatch` plus optional follow-up events.
4. React hook applies patches and displays toasts.
5. Hosted/server routes may replay the same events later for authoritative multiplayer/prize flows.

Do not let components directly grant items, complete quests, or unlock worlds except through the facade exposed by `usePlaygroundRpg`.

## Event contract

Events are facts that already happened. They should be append-only and serializable.

Required MVP events:
- `npc.talked` — player opened dialog with NPC.
- `npc.choice_selected` — player chose a dialog option.
- `quest.objective_completed` — objective completion accepted by quest engine.
- `quest.completed` — all required objectives accepted.
- `inventory.item_granted` — item added, idempotently.
- `inventory.item_equipped` — equipment slot changed.
- `world.entered` — player entered/unlocked zone.
- `chat.sent` — local/world chat sent.
- `combat.enemy_defeated` — enemy defeat accepted.
- `agent.action_requested` / `agent.action_completed` / `agent.action_failed` — agent action lifecycle.

Every event must include `id`, `type`, `createdAt`, `actorId`, and `source`. Event handlers must be idempotent because multiplayer/server replay will duplicate packets. Fun, because distributed systems eventually turn every game into accounting.

## Quest boundary

Quest engine owns:
- objective matching from events
- required vs optional objective completion
- quest completion idempotency
- emitting reward intents, not directly mutating inventory

Quest engine does not own:
- toast copy
- NPC dialog text
- item definitions
- visual HUD order
- prize/easter-egg secrets

MVP API shape:

```ts
advanceQuests(snapshot, event): QuestAdvanceResult
```

`QuestAdvanceResult` returns completed objective ids, completed quest ids, and `RewardGrant[]` intents. Inventory/reward system applies those intents.

## NPC state boundary

NPC state owns:
- per-NPC relationship flags
- seen dialog node ids
- choice availability predicates
- cooldown/once-only choice enforcement
- emitting events for selected choices

NPC state does not own:
- adding items to inventory
- completing quests directly
- unlocking worlds directly

NPC dialog choices should move from imperative fields like `grantItems`/`completeQuest` toward declarative `effects: GameplayEffect[]`. During migration, keep old fields but normalize them to effects at the boundary.

## Inventory and reward boundary

Inventory/rewards owns:
- idempotent item grants
- stack/currency semantics when added
- equipment slot validation
- skill XP/title/world unlock application
- reward toast descriptors

Inventory/rewards does not own:
- deciding whether a quest is complete
- deciding whether an NPC choice is allowed
- calling external prize services

MVP rule: keep item ids public and harmless. Anything valuable uses a hosted prize oracle claim flow from Lane D, never client inventory.

## Agent action API boundary

Agent actions are gameplay verbs that may call Hermes later. They must be request/response objects, not ad hoc component callbacks.

MVP actions:
- `agent.ask_npc` — get dynamic NPC line/lore.
- `agent.build_prompt` — turn player text into a Forge artifact summary.
- `agent.summon_companion` — spawn temporary familiar metadata.
- `agent.judge_duel` — evaluate Arena prompt duel result.
- `agent.generate_lore` — create non-prize lore/zone flavor.

Agent action handler owns:
- schema validation
- rate-limit metadata
- safe public context assembly
- status events

Agent action handler must not own:
- secrets/prize decisions
- direct state mutation without returning `GameplayPatch`
- raw model/provider selection inside UI components

## MVP implementation order

1. `gameplay-contracts.ts` — shared types only. Lowest conflict surface.
2. `gameplay-events.ts` — event factory + idempotency helpers.
3. `inventory-rewards.ts` — pure reward application; migrate duplicate reward code out of hook.
4. `quest-engine.ts` — pure event-to-objective/quest advancement.
5. `npc-state.ts` — normalize dialog effects, once-only choices, relationship flags.
6. `agent-actions.ts` — local mock handler first; server/Hermes call later.
7. Thin `usePlaygroundRpg` integration — hook becomes orchestration/glue, not game-law soup.

## Parallel-worker rules

- One worker per module above.
- Each worker adds tests for its pure module before touching React.
- No worker edits prize/claim code unless assigned Lane D.
- No worker changes visual layout while extracting systems unless assigned Lane A.
- Shared type changes happen only in `gameplay-contracts.ts` and should be backward-compatible by default.
- Prefer additive adapters over rewriting `playground-rpg.ts` in one pass.

## Acceptance criteria

- New systems are serializable and deterministic.
- Applying the same event twice does not double-grant rewards.
- Quests produce reward intents; inventory applies them.
- NPC choices emit effects/events; they do not mutate profile state directly.
- Agent actions return patches/events and never embed secrets in client state.
- `pnpm build` passes after each worker patch.
