# Treasury Approval 50f runtime proof — 2026-06-17

Status: runtime/prototype proof only; no final premium art claim.

## Contract
- Agent: `treasury-watcher` in room `treasury`.
- Runtime proof frames: `60` via `data-war-room-agent-runtime-proof-frames`.
- Existing directional source strips are 6-frame PNG loops; runtime proof loops them over slow station movement/work windows rather than claiming new 60-frame sprite-sheet art.
- The 192px source frames are scaled to the existing 99px in-room operator footprint, preserving shared room scale.
- Station click behavior: Treasury keeps the room visible for 5.6s so walking and work state can be observed before the station cockpit opens.
- Reduced motion: `prefers-reduced-motion` freezes Treasury sprite animation at frame 0 and leaves station/work DOM state readable.

## Static verification checks
- treasury_runtime_proof_frames_60: PASS
- treasury_work_uses_directional_work_strip: PASS
- reduced_motion_css_hook: PASS
- dom_runtime_data_attrs: PASS
- slow_treasury_duration: PASS
- treasury_station_click_delays_dialog: PASS
- treasury_patrol_contract_points: PASS

## Visual proof sheet

Generated local proof sheet: `/Users/mac/hermes-workspace/docs/status/rooms/treasury/treasury-approval-50f-runtime-proof-20260617.png`

## Asset dimensions sampled
- `/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-idle-strip.png` — 1152x192 (6 source frames at 192px, runtime scaled to 99px)
- `/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-walk-n-strip.png` — 1152x192 (6 source frames at 192px, runtime scaled to 99px)
- `/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-walk-e-strip.png` — 1152x192 (6 source frames at 192px, runtime scaled to 99px)
- `/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-work-n-strip.png` — 1152x192 (6 source frames at 192px, runtime scaled to 99px)
- `/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-work-e-strip.png` — 1152x192 (6 source frames at 192px, runtime scaled to 99px)
- `/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-work-s-strip.png` — 1152x192 (6 source frames at 192px, runtime scaled to 99px)

## JSON proof
```json
{
  "generated_at": "2026-06-17T00:00:00Z",
  "room": "treasury",
  "agent": "treasury-watcher",
  "status": "runtime proof, not final premium art claim",
  "checks": {
    "treasury_runtime_proof_frames_60": true,
    "treasury_work_uses_directional_work_strip": true,
    "reduced_motion_css_hook": true,
    "dom_runtime_data_attrs": true,
    "slow_treasury_duration": true,
    "treasury_station_click_delays_dialog": true,
    "treasury_patrol_contract_points": true
  },
  "assets": [
    {
      "path": "/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-idle-strip.png",
      "width": 1152,
      "height": 192,
      "source_frame_size": 192,
      "source_strip_frames": 6,
      "runtime_scaled_frame_size": 99,
      "exists": true
    },
    {
      "path": "/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-walk-n-strip.png",
      "width": 1152,
      "height": 192,
      "source_frame_size": 192,
      "source_strip_frames": 6,
      "runtime_scaled_frame_size": 99,
      "exists": true
    },
    {
      "path": "/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-walk-e-strip.png",
      "width": 1152,
      "height": 192,
      "source_frame_size": 192,
      "source_strip_frames": 6,
      "runtime_scaled_frame_size": 99,
      "exists": true
    },
    {
      "path": "/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-work-n-strip.png",
      "width": 1152,
      "height": 192,
      "source_frame_size": 192,
      "source_strip_frames": 6,
      "runtime_scaled_frame_size": 99,
      "exists": true
    },
    {
      "path": "/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-work-e-strip.png",
      "width": 1152,
      "height": 192,
      "source_frame_size": 192,
      "source_strip_frames": 6,
      "runtime_scaled_frame_size": 99,
      "exists": true
    },
    {
      "path": "/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-work-s-strip.png",
      "width": 1152,
      "height": 192,
      "source_frame_size": 192,
      "source_strip_frames": 6,
      "runtime_scaled_frame_size": 99,
      "exists": true
    }
  ],
  "contract": {
    "runtime_proof_frames": 60,
    "source_strip_frames_per_loop": 6,
    "runtime_scaled_frame_size": 99,
    "states": [
      "rest",
      "walk",
      "work/talk via station speech hooks"
    ],
    "reduced_motion": "prefers-reduced-motion freezes the Treasury sprite at frame 0 and preserves station lock/DOM state",
    "dialog_behavior": "Treasury station clicks keep the room visible for 5.6s before opening the cockpit so walk/work proof is visible"
  }
}
```
