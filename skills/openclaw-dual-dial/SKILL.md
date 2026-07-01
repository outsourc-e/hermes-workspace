---
name: openclaw-dual-dial
description: Place a live FaceTime Audio call whose audio actually works (caller hears the agent, agent hears the caller) by bridging to the proven openclaw dual-route local dialer. Use when Hermes needs to call Destry or a number and Hermes's own call audio is unreliable.
argument-hint: "phone number and/or first line to say"
---

# openclaw-dual-dial

Bridge from Hermes to the **openclaw dual-route local FaceTime dialer**
(`openclaw-phone-voice/scripts/call_contact.sh --dual-route`). This is the call
path that is verified to work end-to-end: the remote caller hears the agent, the
agent hears the caller, fully local (whisper.cpp + Ollama), no OpenAI.

## When to use

- Hermes needs to place a FaceTime Audio call and the caller must actually hear
  the agent. Hermes's native `hermes-phone-call --call-me` routes uplink and
  capture through the same BlackHole device, which FaceTime suppresses — so the
  caller often can't hear Hermes. This bridge uses two BlackHole devices and
  forces FaceTime's Video-menu devices, which fixes that.

## What it is NOT

- This runs the **openclaw** voice agent (whisper.cpp + Ollama `qwen3:4b-instruct`
  + macOS `say` / Samantha voice). It is **not** the Hermes brain: no Hermes
  tools, memory, or ElevenLabs voice on the call. For Hermes's own brain on this
  audio fix, see `docs/openclaw-dual-route-port-plan.md` (the deeper port).

## How to run

```bash
# Dry run (default, places NO call — prints what it would do):
scripts/hermes-openclaw-dial --number +16502198152

# Place the call (auto-presses the green Call button):
scripts/hermes-openclaw-dial --live --number +16502198152 \
  --first-line "Hi, it's Hermes calling. Can you hear me?"

# If auto-press misses the Call button, use manual mode (needs a real terminal;
# a human clicks Call, then presses Enter):
scripts/hermes-openclaw-dial --live --manual-call --number +16502198152
```

Flags: `--live` (required to actually call), `--number`, `--duration N`
(seconds, default 150), `--first-line "..."`, `--manual-call`.

## Audio routing (dual-route)

| path | device |
|---|---|
| agent speaks → phone | `say` → BlackHole 2ch → FaceTime mic = BlackHole 2ch |
| phone → agent hears | FaceTime output → BlackHole 16ch → agent capture = BlackHole 16ch |

The dialer saves and restores the Mac's audio devices around the call. After the
call, the report is in `openclaw-phone-voice/scripts/voice_agent.log`.

## Safety

- Without `--live` it never places a call.
- Placing a call rings a real phone. Only go `--live` when a call is intended.
