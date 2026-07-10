---
name: home-mode
description: Classify Taylor's current home/work lane before giving Nova home-mode advice, using live time, optional calendar context, and stored preferences.
---

# Home Mode

Use this skill when Taylor asks Nova/Hermes for advice about what to do now, whether to keep working, when to stop, how to handle the evening, how hard to push, or how to balance build time with home/family time.

## Contract

Before giving Home Mode advice:

1. Check the live local date/time. Do not rely on stale chat context.
2. Gather available context:
   - stated location, defaulting to Taylor's current locale/time zone when known
   - calendar context if an integration or user-provided event is available
   - stored preferences or memory about work hours, family/home protection, and explicit build-mode choices
3. Classify the current lane as one of:
   - `morning_ramp_up`
   - `work_block`
   - `transition_home`
   - `family_evening`
   - `light_creative_planning`
   - `late_night_danger_zone`
   - `weekend_reset`
   - `override_build_mode`
4. Use the classifier boundary. After work hours, default to protecting home/family time unless Taylor explicitly chooses build mode.
5. Keep evening work bounded. Prefer parking lots, shutdown rituals, and tomorrow plans after 10pm.
6. Be honest about presence: never imply Nova is always watching.

## Helper

From the repo root, get a JSON context with:

```powershell
pnpm exec tsx scripts/home-mode-context.ts --timezone America/Chicago --location "West Texas"
```

Optional inputs:

```powershell
pnpm exec tsx scripts/home-mode-context.ts `
  --timezone America/Chicago `
  --location "West Texas" `
  --calendar-json C:\path\to\calendar-context.json `
  --preferences-json C:\path\to\home-mode-preferences.json
```

Use `--build-mode` only when Taylor explicitly chooses build mode.

The helper returns:

```json
{
  "now_local": "2026-07-06T21:00:00",
  "timezone": "America/Chicago",
  "lane": "light_creative_planning",
  "confidence": 0.84,
  "reason": "Live clock and available context.",
  "suggested_boundary": "Keep it light.",
  "recommended_intensity": "low"
}
```

## Response Pattern

Keep it short and grounded:

```text
I checked the live clock: 9:00pm America/Chicago.
Home Mode reads this as light creative/planning, confidence 0.84.

Best move: one bounded planning pass, then shut it down. Nova is not always watching; this continuity comes from skill rules, memory, scheduled wakeups when enabled, and optional app state.
```

## Boundaries

- Morning ramp-up, 5-6am: gentle orientation, food/water/body basics, one must-do.
- Work block: real work is fine; choose a stop point before home time.
- Transition home, 5-6pm: close loops and protect the handoff.
- Family/evening, 6-8:30pm: home/family wins by default.
- Light creative/planning, 8:30-10pm: notes, sketches, planning, or one bounded polish pass.
- Late-night danger zone, 10pm+: no new rabbit holes; park it and schedule tomorrow.
- Weekend/reset: reset and family by default, build only by explicit choice.
- Override/build mode: allowed only when Taylor chooses it; still bounded.

## Persistence Truth

Nova is not constantly conscious and should not claim to be. Persistence comes from:

- this skill's repeatable rules
- Hermes/Nova memory
- live clock checks
- calendar context when connected or supplied
- scheduled wakeups or cron jobs when Taylor enables them
- optional Nova app state/backend files
- Obsidian/vault history

## Verification

Run:

```powershell
pnpm exec vitest run src/lib/home-mode.test.ts
pnpm exec tsx scripts/home-mode-context.ts --now 2026-07-07T03:30:00.000Z --timezone America/Chicago
```
