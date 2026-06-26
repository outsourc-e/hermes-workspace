/**
 * VoiceMod server module — Hermes fleet carry-on (not upstream).
 *
 * Thin, injection-safe wrappers around the fleet's existing voice backends so
 * the Workspace UI never reimplements voice logic — it drives the real tools:
 *
 *   ~/.hermes/bin/voicemod        — voice/engine/flair overlay (reversible)
 *   ~/.hermes/tts/voice_kit.py    — layered seed/mood kit (pinned core + custom overlay)
 *   ~/.hermes/tts/enroll-micpath.sh — speaker→mic ACOUSTIC enrollment (ID stamps on logs)
 *
 * Kept entirely in new files (this + the /api/voicemod route + src/screens/voicemod)
 * so daily upstream merges stay clean. The only upstream touch is a one-line graft
 * under the SOUL section in profiles-screen.tsx (committed separately as `carry:`).
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const pexecFile = promisify(execFile)

// ─── paths (env-overridable; default to the live fleet layout) ───────────────
const HERMES_HOME = process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
const VOICEMOD_BIN = path.join(HERMES_HOME, 'bin', 'voicemod')
const VOICE_KIT_PY = path.join(HERMES_HOME, 'tts', 'voice_kit.py')
// Per-profile mic-path enroll — a PARAMETRISED extraction of enroll-micpath.sh's
// enroll() function (synth → play through room → parecord echocancel_source → RMS
// gate → enroll_voice.py --ignore via the jasper venv). The shipped enroll-micpath.sh
// is a whole-fleet batch with no per-profile arg, so we cannot call it for one Save.
// Built in step #2; until then enrollViaMicPath reports "pending" honestly.
const ENROLL_VOICE_MICPATH = path.join(HERMES_HOME, 'tts', 'enroll-voice-micpath.sh')
// voice_kits state lives under ~/agents (NOT ~/.hermes) per voice_kit.py / voicemod.
const VOICE_KITS_DIR =
  process.env.VOICE_KITS_DIR ??
  path.join(os.homedir(), 'agents', 'claudia', 'state', 'voice_kits')
const ASSIGNMENTS_JSON = path.join(VOICE_KITS_DIR, 'assignments.json')
const PYTHON = process.env.VOICEMOD_PYTHON ?? 'python3'

// ─── types ───────────────────────────────────────────────────────────────────
export type VoiceEngine = 'cosy' | 'qwen'

export interface AvailableVoices {
  cosy: Array<string>
  qwen: Array<string>
}

export interface VoiceOverlay {
  voice?: string
  engine?: VoiceEngine
  flair?: string
}

export interface ProfileVoiceState {
  profile: string
  /** overlay set via `voicemod` (null => using the broker's immutable default) */
  overlay: VoiceOverlay | null
  /** seed/mood come from the layered kit (core pinned, custom overlay) */
  seed: number | null
  /** true once a custom kit overlay exists for this profile (seed released/editable) */
  hasCustomKit: boolean
  /**
   * true => this profile has a PROTECTED branded reference default (read-only
   * core kit). Reference voices are never overwritten; edits land in the custom
   * overlay and "revert to default" restores the branded core.
   * false => a custom profile with no branded default yet: show "Set as default"
   * so the user can lock their build in as this profile's default.
   */
  hasCoreKit: boolean
  mood: string | null
  palette: Array<string>
  flair: string | null
}

export interface EnrollResult {
  ok: boolean
  /** path of the mic-path script's stdout/stderr tail, for the UI status line */
  output: string
}

// ─── validation (defence-in-depth; we use execFile, never a shell) ───────────
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/

function assertProfile(name: string): string {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`Invalid profile name: ${JSON.stringify(name)}`)
  }
  return name
}

function assertVoice(name: string): string {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`Invalid voice name: ${JSON.stringify(name)}`)
  }
  return name
}

// ─── reads ─────────────────────────────────────────────────────────────────
/** Parse `voicemod voices` into the two engine lists. */
export async function listVoices(): Promise<AvailableVoices> {
  const { stdout } = await pexecFile(VOICEMOD_BIN, ['voices'], { timeout: 15_000 })
  const pick = (engine: string): Array<string> => {
    const line = stdout
      .split('\n')
      .find((l) => l.includes(`engine=${engine}`))
    if (!line) return []
    const after = line.slice(line.indexOf(':') + 1)
    return after
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return { cosy: pick('cosy'), qwen: pick('qwen') }
}

function readOverlay(profile: string): VoiceOverlay | null {
  try {
    const all = JSON.parse(fs.readFileSync(ASSIGNMENTS_JSON, 'utf8')) as Record<
      string,
      VoiceOverlay
    >
    return all[profile] ?? null
  } catch {
    return null
  }
}

/** Read seed/mood/palette/flair from the layered kit via voice_kit.py. */
async function readKit(profile: string): Promise<{
  seed: number | null
  mood: string | null
  palette: Array<string>
  flair: string | null
}> {
  try {
    const { stdout } = await pexecFile(PYTHON, [VOICE_KIT_PY, profile], {
      timeout: 15_000,
    })
    const seedMatch = stdout.match(/seed=(\d+)/)
    const paletteMatch = stdout.match(/palette=\[(.*)\]/)
    const moodMatch = stdout.match(/current mood\s*->\s*'(.*)'/)
    const flairMatch = stdout.match(/flair\s*->\s*'(.*)'/)
    const palette = paletteMatch
      ? paletteMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      : []
    return {
      seed: seedMatch ? Number(seedMatch[1]) : null,
      mood: moodMatch ? moodMatch[1] : null,
      palette,
      flair: flairMatch ? flairMatch[1] : null,
    }
  } catch {
    return { seed: null, mood: null, palette: [], flair: null }
  }
}

function hasCustomKit(profile: string): boolean {
  return fs.existsSync(path.join(VOICE_KITS_DIR, 'custom', `${profile}.json`))
}

function hasCoreKit(profile: string): boolean {
  return fs.existsSync(path.join(VOICE_KITS_DIR, 'core', `${profile}.json`))
}

export async function getProfileVoice(profile: string): Promise<ProfileVoiceState> {
  assertProfile(profile)
  const [kit] = await Promise.all([readKit(profile)])
  return {
    profile,
    overlay: readOverlay(profile),
    seed: kit.seed,
    hasCustomKit: hasCustomKit(profile),
    hasCoreKit: hasCoreKit(profile),
    mood: kit.mood,
    palette: kit.palette,
    flair: kit.flair,
  }
}

// ─── writes (voice/engine/flair work today; seed write lands in step #2) ─────
export async function alterVoice(
  profile: string,
  overlay: VoiceOverlay,
): Promise<void> {
  assertProfile(profile)
  const args = ['alter', profile]
  if (overlay.voice) args.push('--voice', assertVoice(overlay.voice))
  if (overlay.engine) {
    if (overlay.engine !== 'cosy' && overlay.engine !== 'qwen') {
      throw new Error(`Invalid engine: ${overlay.engine}`)
    }
    args.push('--engine', overlay.engine)
  }
  if (overlay.flair != null) args.push('--flair', overlay.flair.slice(0, 500))
  await pexecFile(VOICEMOD_BIN, args, { timeout: 20_000 })
}

export async function resetVoice(profile: string): Promise<void> {
  assertProfile(profile)
  await pexecFile(VOICEMOD_BIN, ['reset', profile], { timeout: 20_000 })
}

// ── voice_kit writers: seed / set-default / revert (step #2 — now live) ──────
async function runVoiceKit(args: Array<string>): Promise<string> {
  const { stdout } = await pexecFile(PYTHON, [VOICE_KIT_PY, ...args], { timeout: 15_000 })
  return stdout.trim()
}

/** Pin a fixed seed (fixed-seed mitigation) or release it, into the custom kit.
 *  cosy re-reads the kit per synth, so this takes effect on the next utterance. */
export async function setSeed(
  profile: string,
  opts: { seed?: number; release?: boolean },
): Promise<void> {
  assertProfile(profile)
  if (opts.release) {
    await runVoiceKit(['set', profile, '--release-seed'])
  } else if (opts.seed != null && Number.isFinite(opts.seed)) {
    await runVoiceKit(['set', profile, '--seed', String(Math.trunc(opts.seed))])
  } else {
    throw new Error('setSeed requires a finite seed or release=true')
  }
}

interface DefaultSnapshot {
  voice?: string
  engine?: VoiceEngine
  flair?: string
  seed?: number
}

async function getDefault(profile: string): Promise<DefaultSnapshot | null> {
  try {
    const snap = JSON.parse(await runVoiceKit(['get-default', profile])) as DefaultSnapshot
    return snap && snap.voice ? snap : null
  } catch {
    return null
  }
}

/**
 * "Set as default" — snapshot a CUSTOM profile's current build (voice/engine/flair
 * + seed) to defaults/<profile>.json so revert restores it. Refuses on branded
 * profiles (their default is the protected core). Requires a saved overlay first.
 */
export async function setDefaultVoice(profile: string): Promise<EnrollResult> {
  assertProfile(profile)
  if (hasCoreKit(profile)) {
    return { ok: false, output: `${profile} has a protected branded default — set-default is for custom profiles only.` }
  }
  const state = await getProfileVoice(profile)
  const voice = state.overlay?.voice
  const engine = state.overlay?.engine
  if (!voice || !engine) {
    return { ok: false, output: 'Save a voice for this profile first, then Set as default.' }
  }
  const args = ['set-default', profile, '--voice', voice, '--engine', engine]
  if (state.overlay?.flair) args.push('--flair', state.overlay.flair.slice(0, 500))
  if (state.seed != null) args.push('--seed', String(state.seed))
  try {
    return { ok: true, output: await runVoiceKit(args) }
  } catch (err) {
    return { ok: false, output: (err as Error).message }
  }
}

/**
 * "Revert to default":
 *  - custom profile WITH a set-as-default snapshot → restore that build.
 *  - otherwise (branded, or custom w/o snapshot) → drop the overlay + custom kit
 *    so the protected branded core / broker default returns.
 */
export async function revertToDefault(profile: string): Promise<void> {
  assertProfile(profile)
  const snap = await getDefault(profile)
  if (snap?.voice && snap.engine) {
    await alterVoice(profile, { voice: snap.voice, engine: snap.engine, flair: snap.flair })
    if (snap.seed != null) await setSeed(profile, { seed: snap.seed })
    return
  }
  await resetVoice(profile) // drop the voicemod overlay
  try {
    await runVoiceKit(['reset', profile]) // drop the custom kit (seed/flair)
  } catch {
    /* no custom kit to clear */
  }
}

/**
 * Save → run a track of the saved voice through the SPEAKER→MICROPHONE path and
 * enroll its embedding into the ignore set, so log lines get correctly ID-stamped
 * to this profile (and the broadcast doesn't read as a stranger). Deliberately the
 * acoustic mic path (parecord echocancel_source while the room speaker plays the
 * synth), NOT clean digital synth — the digital version mis-tags (documented leak).
 *
 * Drafts directly off the existing voice-ID enrollment system: the per-profile
 * script is a parametrised copy of enroll-micpath.sh's enroll() — same synth ports,
 * same RMS gate, same `enroll_voice.py --ignore` via the jasper venv python.
 *
 * Returns honestly: if the per-profile entrypoint isn't built yet (step #2), this
 * reports pending rather than firing the whole-fleet batch or faking success.
 */
export async function enrollViaMicPath(
  profile: string,
  voice: string,
  engine: VoiceEngine,
): Promise<EnrollResult> {
  assertProfile(profile)
  assertVoice(voice)
  if (engine !== 'cosy' && engine !== 'qwen') {
    return { ok: false, output: `Invalid engine: ${engine}` }
  }
  if (!fs.existsSync(ENROLL_VOICE_MICPATH)) {
    return {
      ok: false,
      output:
        `Per-profile mic-path enroll backend not built yet (step #2): expected ` +
        `${ENROLL_VOICE_MICPATH} — a parametrised extraction of enroll-micpath.sh's ` +
        `enroll() (synth → room → echocancel_source → RMS gate → enroll_voice.py --ignore).`,
    }
  }
  try {
    const { stdout, stderr } = await pexecFile(
      'bash',
      [ENROLL_VOICE_MICPATH, profile, voice, engine],
      { timeout: 180_000 },
    )
    return { ok: true, output: (stdout + stderr).trim().slice(-2000) }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      output: ((e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? '')).slice(-2000),
    }
  }
}
