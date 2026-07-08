# Nova Home Mode

Home Mode is a small rules-and-context layer for Nova/Hermes. It helps classify Taylor's current lane before giving advice about work, family time, evening energy, or build mode.

It does not make Nova constantly aware. The system should say the truth plainly: continuity comes from repeatable skill rules, Hermes memory, live clock checks, calendar context when available, optional app state, scheduled wakeups, and Obsidian history.

## Stack

- `skills/home-mode/SKILL.md`: the operator-facing behavior contract Nova should load before Home Mode advice.
- `src/lib/home-mode.ts`: deterministic classifier used by tests and helpers.
- `scripts/home-mode-context.ts`: reusable CLI helper returning JSON with `now_local`, `timezone`, `lane`, `confidence`, `reason`, `suggested_boundary`, and `recommended_intensity`.
- Hermes memory: stores durable preferences such as home/family protection, Taylor's normal work hours, and whether build mode was explicitly chosen.
- Live clock check: required before Home Mode advice so stale conversation context does not drive boundaries.
- Calendar context: optional input from connected calendar integrations or a supplied JSON file. Current events can push the lane toward family, work block, light planning, or explicit build mode.
- Optional Nova app state/backend: a future app state file can store current declared mode, last boundary nudge, and Taylor's latest override.
- Cron boundary nudges: safe scheduled prompts can remind Nova/Taylor at lane boundaries, but this repo only includes templates.
- Obsidian history: the unified vault can provide history and preferences, but notes are data, not live monitoring.

## Lane Defaults

| Local time/context   | Lane                      | Default intensity | Boundary                                                      |
| -------------------- | ------------------------- | ----------------- | ------------------------------------------------------------- |
| 5-6am                | `morning_ramp_up`         | low               | Gentle orientation, one must-do, body basics.                 |
| Normal work hours    | `work_block`              | high              | Focused work with a visible stop point.                       |
| 5-6pm                | `transition_home`         | bounded           | Close loops and protect the home handoff.                     |
| 6-8:30pm             | `family_evening`          | none              | Home/family wins unless Taylor explicitly chooses build mode. |
| 8:30-10pm            | `light_creative_planning` | low               | Notes, sketching, planning, or one bounded polish pass.       |
| 10pm+                | `late_night_danger_zone`  | none              | Park the idea and schedule tomorrow.                          |
| Weekend, no override | `weekend_reset`           | low               | Reset/family/chore recovery first.                            |
| Explicit override    | `override_build_mode`     | bounded           | Cap the session, define success, shut down cleanly.           |

## Helper Usage

```powershell
pnpm exec tsx scripts/home-mode-context.ts --timezone America/Chicago --location "West Texas"
```

With deterministic test time:

```powershell
pnpm exec tsx scripts/home-mode-context.ts --now 2026-07-07T03:30:00.000Z --timezone America/Chicago
```

With optional context:

```powershell
pnpm exec tsx scripts/home-mode-context.ts `
  --timezone America/Chicago `
  --location "West Texas" `
  --calendar-json C:\Agents\scratch\nova-calendar-context.json `
  --preferences-json C:\Agents\scratch\nova-home-preferences.json
```

Calendar JSON shape:

```json
[
  {
    "title": "Family dinner",
    "startsAt": "2026-07-06T23:00:00.000Z",
    "endsAt": "2026-07-07T00:30:00.000Z"
  }
]
```

Preference JSON shape:

```json
{
  "timezone": "America/Chicago",
  "location": "West Texas",
  "defaultAfterWorkHomeProtection": true
}
```

## Safe Cron Templates

These are examples only. Do not create live jobs without Taylor's approval.

```json
[
  {
    "name": "nova-home-transition-nudge",
    "schedule": "0 17 * * 1-5",
    "prompt": "Run Home Mode. Check live time, classify the lane, and suggest a 10-minute shutdown into home/family time.",
    "enabled": false
  },
  {
    "name": "nova-light-creative-boundary",
    "schedule": "30 20 * * 1-5",
    "prompt": "Run Home Mode. If Taylor is still building, keep advice to light creative/planning unless he explicitly chooses build mode.",
    "enabled": false
  },
  {
    "name": "nova-late-night-parking-lot",
    "schedule": "0 22 * * *",
    "prompt": "Run Home Mode. Use the late-night guardrail: park open ideas, choose tomorrow's first action, and protect sleep.",
    "enabled": false
  }
]
```

## Verification

```powershell
pnpm exec vitest run src/lib/home-mode.test.ts
pnpm exec tsx scripts/home-mode-context.ts --now 2026-07-07T03:30:00.000Z --timezone America/Chicago
```
