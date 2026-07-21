# War Room Agent → Hermes Profile Alignment — Phase 1

Scope approved by DLV on 2026-07-01: gradually connect current Workspace / Living V3 agents to real Hermes profiles, excluding Ares, Aphrodite, and Heimdall for now. No cleanup/deletion in this phase.

## Phase 1 result

- Created real Hermes profiles for approved existing agent names only: `terra`, `loki`, `thor`, `odin`, `julius`, `alexander`, `napoleon`, `saladin`, `genghis`, `hannibal`.
- Did **not** create generic worker names.
- Did **not** create/rename Ares, Aphrodite, or Heimdall.
- `hermes` profile name is reserved by the CLI, so visible Hermes is temporarily routed through the existing real `default` profile until DLV approves a better non-generic profile id.
- Workspace live-agent calls now add `--profile <id>` for approved agents.
- Smoke verified `terra` can run as a real Hermes profile: `session_id: 20260701_161431_c4233f` returned `{"ok":true,"profile":"terra"}`.

## Current approved mapping

| Visible agent | Current status | Hermes profile used | Room | Main scope |
| --- | --- | --- | --- | --- |
| Hermes | connected via existing master profile | `default` | Olympus Command | master router / station routing / safety |
| Terra | real profile created + routed | `terra` | Terra Forge | 3D, model search, slicer/print QA, printer status |
| Loki | real profile created + routed | `loki` | Etsy Market Lab | product hunt, source leads, candidate packets |
| Thor | real profile created + routed | `thor` | Etsy Market Lab | SEO, source truth, ShotLab prep, QA readiness |
| Odin | real profile created + routed | `odin` | Etsy Market Lab | final draft review and DLV approval gates |
| Julius Caesar | real profile created + routed | `julius` | Council of Strategists | structure, ownership, clear decisions |
| Alexander | real profile created + routed | `alexander` | Council of Strategists | momentum, ambition, visible wins |
| Napoleon | real profile created + routed | `napoleon` | Council of Strategists | execution order, milestones, QA |
| Saladin | real profile created + routed | `saladin` | Council of Strategists | trust, truthfulness, restraint |
| Genghis Khan | real profile created + routed | `genghis` | Council of Strategists | simple laws, scale, delegation |
| Hannibal Barca | real profile created + routed | `hannibal` | Council of Strategists | flanks, hidden risks, plan B |

## Deferred by DLV

| Agent | Reason |
| --- | --- |
| Ares | defer profile decision |
| Aphrodite | defer profile decision |
| Heimdall | defer profile/asset decision |

## Hidden/planned, not connected in this phase

`athena`, `oracle`, `hephaestus`, `merchant-scout`, `atlantis-archivist`, `treasury-guardian`, `roster-keeper`, `daedalus`, `signal-runner`.

These should only become real profiles after DLV approves their exact names and visual readiness.

## Next phase

Phase 2 should add the scoped context-packet layer:

```text
agent id → profile id → room/station scope → Obsidian/source notes → allowed tools → blocked actions → answer/artifact back to Workspace
```

No beta-profile cleanup/delete should happen until the profile mapping and context-packet behavior are verified.

## Phase 2 result — Obsidian knowledge packets

DLV approved connecting every approved profile to the existing Obsidian knowledge by role. Hermes itself remains the original strongest `default` profile.

### What is connected now

- Workspace live-agent prompts now include a **SCOPED OBSIDIAN / SECOND BRAIN CONTEXT PACKET**.
- Each approved profile also has its own `SOUL.md` with role, Obsidian anchors, and safety boundaries.
- The packets are compact summaries of existing Obsidian notes, not whole-vault dumps.
- Ares, Aphrodite, and Heimdall remain intentionally unconnected/deferred until DLV reopens them.

### Phase 2 mapping

| Agent | Hermes profile | Obsidian anchors |
| --- | --- | --- |
| Hermes | `default` | `Universal Workspace Action Wrapper - מקור אמת`; `War Room Agents and Automation` |
| Terra | `terra` | `06 Hermes/Terra Forge Workspace Memory.md`; `Universal Workspace Action Wrapper - מקור אמת` |
| Loki | `loki` | `Etsy Market Lab - מקור אמת נוכחי`; `Etsy Market Lab - Product Tracker Index` |
| Thor | `thor` | `Etsy Market Lab - מקור אמת נוכחי`; `Etsy Market Lab - Product Tracker Index`; `War Room Agents and Automation` |
| Odin | `odin` | `Etsy Market Lab - מקור אמת נוכחי`; `Etsy Market Lab - Product Tracker Index`; `Universal Workspace Action Wrapper - מקור אמת` |
| Julius | `julius` | `Council of Strategists - מקור אמת 2026-06-27`; `Universal Workspace Action Wrapper - מקור אמת` |
| Alexander | `alexander` | `Council of Strategists - מקור אמת 2026-06-27`; `Universal Workspace Action Wrapper - מקור אמת` |
| Napoleon | `napoleon` | `Council of Strategists - מקור אמת 2026-06-27`; `Universal Workspace Action Wrapper - מקור אמת` |
| Saladin | `saladin` | `Council of Strategists - מקור אמת 2026-06-27`; `Universal Workspace Action Wrapper - מקור אמת` |
| Genghis | `genghis` | `Council of Strategists - מקור אמת 2026-06-27`; `Universal Workspace Action Wrapper - מקור אמת` |
| Hannibal | `hannibal` | `Council of Strategists - מקור אמת 2026-06-27`; `Universal Workspace Action Wrapper - מקור אמת` |

### Important truth label

This is not yet live arbitrary Obsidian browsing per agent. It is a safe first connection: approved role-specific context packets + profile SOUL files + prompt injection in Workspace. Later phases can add an authenticated read-only packet API if DLV wants dynamic note retrieval.
