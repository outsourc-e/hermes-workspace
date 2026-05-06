# HermesWorld Game Audit + Execution Roadmap

Date: 2026-05-05
Owner: Eric / Aurora
Status: active sprint plan

## Snapshot truth

### Analytics

Real archived yesterday stats are **not available yet**. The daily snapshot system was added tonight, so historical day views will start filling from this deployment forward.

Current live worker sample at 2026-05-05 23:40 EDT:

- Online now: 3
- Peak today: 10
- By world: Training 1, Agora 2

For public screenshots tonight, use live/current stats and frame as "Day 1 public build / live playtest" rather than "yesterday".

## Product thesis

HermesWorld is the playable layer for AI agents.

The hook is not just "browser MMO". The hook is:

> You play by day. Your AI agent plays by night. You can also play together.

That means the game needs to be fun enough for humans, structured enough for agents, and legible enough to screenshot/tweet.

## Current strengths

- Public browser world is live at hermes-world.ai.
- Six zones exist: Training, Agora, Forge, Grove, Oracle, Arena.
- Multiplayer presence works.
- NPC dialog / quest / inventory / level systems exist.
- Mobile controls now exist: joystick, touch talk, camera rotate buttons.
- Agora is now the starting zone, which gives a better first impression.
- Admin analytics now has daily date picker going forward.
- Public roadmap + Twitter content are drafted.

## Current gaps

### First impression

- Agora spawn is better, but still needs a visible golden "start here" beacon.
- The player needs to know instantly: who am I, where do I go, why should I care?
- Objective banner is improved but quest tracker / HUD still need final phone layout polish.

### Mobile

- Usable now, not yet premium.
- Need final top HUD collision pass.
- Chat should feel intentionally docked, not floating.
- Touch NPC interaction should be forgiving: tap NPC should walk/open dialog cleanly.
- Need mobile screenshot review on iPhone widths: 390px, 430px, and small Android.

### Quests

- First quest is functional but not emotionally strong yet.
- Need completion celebration, stronger reward moment, better onboarding copy.
- Quest chain should be grouped into visible chapters:
  1. Arrival in Agora
  2. Training Portal
  3. First Tool / Gear
  4. First Chat
  5. First Agent Companion
  6. Forge unlock

### NPCs

- NPCs have lore, but too much text can read like product copy.
- Need shorter opening lines, repeat-visit variance, and state-aware replies.
- Need clear separation: ambient NPC flavor vs real human chat vs AI-agent players.

### Agent play

- This is the big missing feature.
- Need deterministic action layer, not UI automation only.
- Agents need verbs, perception, state, quest objectives, and safe rate limits.

### Visuals

- Need stronger zone silhouette, lighting/fog, path readability, landmarks, density.
- Agora should feel like a hub/city, not just another zone.
- Training should feel like a tutorial instance/dungeon.
- Arena needs real stakes or should be visually reframed until BenchLoop integration exists.

## Roadmap

## v0.2 — Phone-shareable world (next 24-48h)

Goal: someone opens hermes-world.ai on mobile and immediately understands the game.

### Ship list

1. Mobile HUD final pass
   - Character card top-left final positioning
   - Objective banner compact
   - Quest tracker moved below objective or hidden behind Menu on mobile
   - Chat dock left and collapsed by default if viewport too small

2. Tap-to-play interactions
   - Tap NPC = move toward NPC and open dialog when close
   - If already close, open instantly
   - Talk button pulses when NPC is nearby

3. Agora onboarding marker
   - Golden beacon/pillar over Athena
   - Short toast: "Talk to Athena to begin"
   - Optional minimap ping on Athena

4. Quest 1 reward moment
   - Confetti / particles
   - Sound/fanfare if audio is enabled
   - Toast: "Hermes Sigil acquired"
   - Athena follow-up line: "Good. Now the Training portal recognizes you."

5. Public screenshot polish
   - Hide awkward debug-ish labels
   - Ensure chat/HUD do not cover avatar on mobile
   - Capture 3 screenshots: Agora spawn, Athena dialog, multiplayer/chat

## v0.3 — AI agents can play (2-week hero)

Goal: external agents can enter HermesWorld, perceive state, choose actions, and progress.

### Agent API v1

Endpoint sketch:

`POST /api/playground-agent/step`

Input:

```json
{
  "agentId": "agent_123",
  "agentName": "Eric's Night Agent",
  "world": "agora",
  "intent": "progress_current_quest",
  "action": {
    "type": "talk_to",
    "target": "athena"
  }
}
```

Output:

```json
{
  "ok": true,
  "state": {
    "world": "agora",
    "position": { "x": 0, "z": 6 },
    "activeQuest": "training-q1",
    "objective": "talk_to_npc:athena",
    "inventory": []
  },
  "perception": {
    "nearby": ["athena", "apollo"],
    "availableActions": [
      { "type": "move_to", "target": "athena" },
      { "type": "talk_to", "target": "athena" },
      { "type": "chat", "body": "..." }
    ]
  }
}
```

### Required verbs

- `observe`
- `move_to`
- `talk_to`
- `choose_dialog`
- `accept_quest`
- `equip`
- `travel`
- `chat`
- `attack`
- `loot`
- `rest`

### Agent identity

- Agent players get a 🤖 badge/nameplate.
- Agent activity is counted separately from humans in admin.
- Agent chat should be labeled as agent chat, not ambient NPC.

### Agent playbook

Create copy-paste prompts for:

- Hermes Agent
- Claude Code / Codex
- Cursor / Gemini / Kimi
- Local Ollama agent

Core prompt:

> You are controlling an AI agent inside HermesWorld. Your goal is to complete quests safely, observe before acting, avoid spam, and report progress. Use the available action API only. Do not invent state.

## v0.4 — World depth

Goal: make HermesWorld worth returning to.

- Daily quests
- Weekly world events
- Easter eggs
- Secret sigils
- Hidden lore fragments
- Agent companions
- Better zone transitions
- Party/co-op primitives
- Basic achievements/profile page

## v0.5 — BenchLoop Arena

Goal: make Arena real.

- Prompt duels backed by BenchLoop
- Model-vs-model battles
- Score cards: speed, quality, cost
- Weekly leaderboard
- Shareable duel result image

## v1.0 — Oasis loop

Goal: humans + agents share a persistent world.

- Account persistence
- Agent offline progression
- Agent economy/shopkeepers
- User-generated zones
- Live events
- Voice/TTS NPCs
- Public protocol for bots/agents
- Races / hunts / special keys

## Immediate next actions

1. Finish mobile HUD collision fixes.
2. Add Athena beacon in Agora.
3. Add Quest 1 completion celebration.
4. Add first easter egg.
5. Begin Agent API spike with minimal `observe` + `move_to` + `talk_to`.
6. Capture screenshots/video for Twitter.

## Twitter framing

Tonight:

> HermesWorld mobile v0.2 is live.
> Touch joystick, tap-to-talk NPCs, camera controls, Agora spawn, smoother multiplayer.
> Next: your AI agent plays while you sleep.

Tomorrow:

> Roadmap: v0.3 is the Agent API. Hermes/Codex/Claude/local models can walk the world, talk to NPCs, complete quests, and level up while you're offline.

Use screenshots of:

1. Agora spawn
2. Athena dialog
3. Admin stats panel
4. Mobile controls

## Audit checklist for next review

- Open on iPhone width and verify no HUD collisions.
- Complete Quest 1 on desktop and mobile.
- Confirm NPC dialog never renders HTML fallback again.
- Confirm remote movement is smooth across two browsers.
- Confirm admin date picker works for today and gracefully handles empty yesterday.
- Confirm landing page still loads after static build copy changes.
- Confirm worker deploy uses `playground-ws-worker/wrangler.toml`, not root worker.
