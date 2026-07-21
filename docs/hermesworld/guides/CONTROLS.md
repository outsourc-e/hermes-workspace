# Controls

HermesWorld supports desktop keyboard/mouse and mobile touch. Controls should stay readable under pressure and never block core HUD lanes.

See also: [Getting Started](GETTING-STARTED.md), [Social](SOCIAL.md).

## Desktop movement

| Action                             | Control                                  |
| ---------------------------------- | ---------------------------------------- |
| Move forward / left / back / right | `W` `A` `S` `D`                          |
| Alternate movement                 | Arrow keys                               |
| Sprint / hurry, when enabled       | `Shift`                                  |
| Interact / talk / confirm          | `E` or on-screen prompt                  |
| Cancel / close dialog              | `Esc`                                    |
| Open chat                          | `Enter`                                  |
| Send chat                          | `Enter` while chat is focused            |
| Toggle map / minimap detail        | `M`, when enabled                        |
| Ability slots                      | Number keys `1`-`4`, when enabled        |
| Modifier / special                 | `Space` or UI button, depending on build |

## Mouse

| Action                    | Control                       |
| ------------------------- | ----------------------------- |
| Select UI / click button  | Left click                    |
| Camera drag, when enabled | Right drag or drag world pane |
| Inspect UI tooltip        | Hover                         |
| Scroll panels             | Mouse wheel / trackpad        |

## Mobile touch

| Action                    | Control                                 |
| ------------------------- | --------------------------------------- |
| Move                      | Left virtual joystick                   |
| Interact / primary action | Right-rail action button                |
| Secondary actions         | Right-rail stacked buttons              |
| Chat                      | Chat panel / input toggle               |
| Camera / look             | Drag open world area, when enabled      |
| Close dialogs             | Close button or outside safe panel area |

## Mobile lane rules

Mobile UI must preserve three sacred lanes:

1. **Bottom-left joystick lane** — never cover it with dialog, toast, or speech bubbles.
2. **Right-rail action lane** — keep interact/combat buttons reachable.
3. **Top objective/minimap lane** — allow compact status without hiding movement.

Speech bubbles should float above heads and shrink on mobile. Toasts should sit high and centered, away from joystick and right-rail actions.

## Dialog controls

NPC dialog appears as parchment speech bubbles. Choices may appear as buttons below the NPC line.

- Use click/tap to choose.
- Use `Esc` or close to exit.
- Chat-style NPC conversations preserve recent turns.

## Accessibility notes

Planned settings:

- Reduced motion.
- Larger text.
- High contrast UI.
- Rebindable desktop keys.
- Persistent joystick size setting.
- Chat opacity controls.

Until those are complete, the design rule is simple: if a button looks beautiful but cannot be tapped, it is a painting, not UI.
