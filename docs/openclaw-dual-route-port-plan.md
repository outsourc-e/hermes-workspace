# Port plan: dual-route call audio into Hermes's own call stack

Status: **planned** (bridge shipped first — see `skills/openclaw-dual-dial` and
`scripts/hermes-openclaw-dial`).

## Problem

Hermes places FaceTime Audio calls via `scripts/hermes-phone-call` →
`facetime-audio-alex --route-on`, which sets the Mac's **input, output, and
system** audio all to `BlackHole 2ch`. Because uplink (Hermes TTS) and capture
(caller audio) share one device, FaceTime suppresses the injected mic audio, so
**the remote caller often cannot hear Hermes**. Hermes also never forces
FaceTime's Video-menu Microphone/Output — it only sets macOS defaults and hopes
FaceTime follows.

The openclaw-phone-voice project solved this. Verified working recipe lives in
`openclaw-phone-voice/CALLING_STATUS.md`. Two ingredients:

1. **Dual-BlackHole routing** — two separate virtual devices, no shared loop:
   - Hermes TTS → macOS output `BlackHole 2ch` → FaceTime mic = `BlackHole 2ch`
   - caller → FaceTime output = `BlackHole 16ch` → Hermes capture = `BlackHole 16ch`
2. **Forcing FaceTime's Video-menu devices** via AppleScript (mic = BlackHole 2ch,
   output = BlackHole 16ch), re-applied after the Call button is pressed, because
   FaceTime re-evaluates Continuity devices when the call starts.

The bridge (`hermes-openclaw-dial`) gets the working audio today but runs the
**openclaw** agent (whisper.cpp + Ollama + `say`), not Hermes's brain. This plan
puts Hermes's own brain (tools, memory, ElevenLabs voice) on the fixed audio.

## Changes required

### 1. `~/.local/bin/facetime-audio-alex` (private helper)

- Add `--route-on-dual` that:
  - saves prior input/output/system (as today),
  - sets macOS **output** = `BlackHole 2ch` (so ElevenLabs playback / TTS reaches
    the FaceTime mic), leaves input as-is,
  - forces the FaceTime **Video menu**: Microphone → `BlackHole 2ch` (occurrence 1),
    Output → `BlackHole 16ch` (occurrence 2), re-applied after `--call`.
  - The AppleScript occurrence-forcing logic can be lifted from
    `openclaw-phone-voice/scripts/call_contact.sh` (`force_facetime_devices`).
- Keep `--route-off` restoring the saved devices.

### 2. `scripts/hermes-phone-call`

- Add a `--dual-route` flag that calls `facetime-audio-alex --route-on-dual`
  instead of `--route-on`, and re-forces devices after `open_call`.
- Pass the capture device (`BlackHole 16ch`) through to the voice loop.

### 3. `scripts/hermes_voice_call.py` + `tools/voice_mode`

- Make the recorder capture from an explicit device (`BlackHole 16ch`) rather
  than the macOS default input. Add an env/arg, e.g. `HERMES_CAPTURE_DEVICE`.
- Ensure TTS playback (`play_audio_file` / `hermes-speak-live`) targets the macOS
  default output (`BlackHole 2ch`) so it reaches the FaceTime mic. Confirm
  ElevenLabs audio is played to that device, not a hardcoded one.
- Pause capture during TTS playback to avoid the agent transcribing itself
  (openclaw uses a paused flag around `say`).

### 4. Validation

- No-call smoke test: verify the recorder opens `BlackHole 16ch` and TTS plays to
  `BlackHole 2ch`.
- Live call: confirm caller hears Hermes (uplink) and Hermes transcribes the
  caller (downlink) with no self-echo, then graceful hang-up.
- Confirm `route-off` restores devices even on crash (trap on EXIT).

## Risk / rollback

- Touches a working production call system and a `0700` private helper. Keep the
  new path behind `--dual-route` so the existing `--route-on` behavior is
  untouched; roll back by not passing the flag.
- The bridge remains available as a fallback the whole time.

## Reference

- Working implementation: `openclaw-phone-voice/scripts/call_contact.sh`
  (`--dual-route`, `force_facetime_devices`, `set_split_route_audio`) and
  `voice_agent.py` (`LocalBackend`, device selection, pause-during-TTS).
- Status/recipe: `openclaw-phone-voice/CALLING_STATUS.md`.
