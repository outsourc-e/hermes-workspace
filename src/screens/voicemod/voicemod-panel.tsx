/**
 * VoiceModPanel — per-agent voice/seed/mood controls, designed to sit directly
 * under the SOUL section in profiles-screen.tsx (the SOUL = behaviour, VoiceMod =
 * voice identity; co-located per agent).
 *
 * Fleet carry-on: this whole src/screens/voicemod/ dir is new, so it never
 * conflicts on upstream merges. The only upstream edit is a one-line graft that
 * renders <VoiceModPanel profile={...} /> here, committed separately as `carry:`.
 *
 * Backed by the real fleet tools via /api/voicemod (voicemod CLI + voice_kit.py +
 * the mic-path enroll). What's live now: voice/engine/flair + Save-with-mic-path
 * enroll track. What's read-only pending step #2: the seed write (fixed-seed
 * mitigation) — surfaced and labelled, not faked.
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useVoiceMod, type VoiceEngine } from './use-voicemod'

interface VoiceModPanelProps {
  /** crew profile slug, e.g. "claudia" | "bash" | "zoe" | "steward" | "reviewer" */
  profile: string
  className?: string
}

const fieldLabel = 'text-xs font-medium uppercase tracking-wide text-primary-500'
const controlBase =
  'h-9 w-full rounded-lg border border-primary-200 bg-transparent px-3 text-sm text-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-950'

export function VoiceModPanel({ profile, className }: VoiceModPanelProps) {
  const { voices, state, loading, busy, error, enroll, save, reset, setDefault, setSeed } =
    useVoiceMod(profile)

  // branded reference (core kit present) => protected default + revert only.
  // custom profile (no core) => offer "Set as default" to lock their build.
  const isBranded = state?.hasCoreKit ?? false
  const [seedDraft, setSeedDraft] = useState<string>('')

  const [engine, setEngine] = useState<VoiceEngine>('cosy')
  const [voice, setVoice] = useState<string>('')
  const [flair, setFlair] = useState<string>('')

  // Seed local form from server state when it (re)loads.
  useEffect(() => {
    if (!state) return
    const e = (state.overlay?.engine ?? 'cosy') as VoiceEngine
    setEngine(e)
    setVoice(state.overlay?.voice ?? '')
    setFlair(state.overlay?.flair ?? state.flair ?? '')
    setSeedDraft(state.seed != null ? String(state.seed) : '')
  }, [state])

  const voiceOptions = engine === 'qwen' ? voices.qwen : voices.cosy

  return (
    <section className={cn('flex flex-col gap-4 rounded-xl border border-primary-200 p-4', className)}>
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-primary-950">VoiceMod</h3>
          <p className="text-xs text-primary-500">
            Voice identity for <span className="font-medium">{profile}</span> — sits under the SOUL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state &&
            (isBranded ? (
              <span
                className="rounded-full border border-primary-300 px-2 py-0.5 text-xs text-primary-600"
                title="Branded reference voice — protected; edits go to a reversible overlay, never the reference."
              >
                🛡 protected default
              </span>
            ) : (
              <span className="rounded-full border border-amber-300 px-2 py-0.5 text-xs text-amber-700">
                custom profile
              </span>
            ))}
          {loading && <span className="text-xs text-primary-400">loading…</span>}
        </div>
      </header>

      {/* engine + voice */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Engine</span>
          <select
            className={controlBase}
            value={engine}
            disabled={busy}
            onChange={(ev) => {
              setEngine(ev.target.value as VoiceEngine)
              setVoice('') // engines have disjoint voice lists
            }}
          >
            <option value="cosy">CosyVoice (clone)</option>
            <option value="qwen">Qwen (preset)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Voice</span>
          <select
            className={controlBase}
            value={voice}
            disabled={busy}
            onChange={(ev) => setVoice(ev.target.value)}
          >
            <option value="" disabled>
              select a voice…
            </option>
            {voiceOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* flair (mood instruct text) */}
      <label className="flex flex-col gap-1">
        <span className={fieldLabel}>Flair / mood instruct</span>
        <input
          className={controlBase}
          value={flair}
          disabled={busy}
          placeholder="e.g. dry, warm, composed, unflappable — natural inflection"
          onChange={(ev) => setFlair(ev.target.value)}
        />
      </label>

      {/* seed — fixed-seed mitigation: pin a fixed seed or release it (date-based) */}
      <div className="flex flex-col gap-1.5 rounded-lg bg-primary-50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>Seed (identity lock)</span>
          <span className="text-xs text-primary-400">
            {state?.hasCustomKit ? 'custom kit' : 'pinned (branded core)'} · live next utterance
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            className={cn(controlBase, 'h-8 flex-1')}
            value={seedDraft}
            disabled={busy}
            placeholder="0 = released (date-based)"
            onChange={(ev) => setSeedDraft(ev.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || seedDraft === '' || Number.isNaN(Number(seedDraft))}
            onClick={() => setSeed({ seed: Number(seedDraft) })}
            title="Pin this exact seed → reproducible voice (stops accent drift)"
          >
            Pin
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setSeed({ release: true })}
            title="Release the seed → cosy falls back to the date-based seed"
          >
            Release
          </Button>
        </div>
      </div>

      {/* mood palette (from the layered kit) */}
      {state?.palette && state.palette.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={fieldLabel}>Mood palette{state.mood ? ` · now: ${state.mood}` : ''}</span>
          <div className="flex flex-wrap gap-1.5">
            {state.palette.map((m) => (
              <span
                key={m}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-xs',
                  m === state.mood
                    ? 'border-primary-950 bg-primary-950 text-primary-50'
                    : 'border-primary-200 text-primary-600',
                )}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !voice}
          onClick={() => save({ voice, engine, flair })}
        >
          Apply (no enroll)
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={busy || !voice}
          onClick={() => save({ voice, engine, flair, save: true })}
          title="Apply + run a mic-path track to ID-stamp this voice on logs"
        >
          {busy ? 'Saving…' : 'Save + stamp voice (mic path)'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => reset()}
          title={
            isBranded
              ? "Drop the overlay → restore this profile's protected branded default"
              : "Drop the overlay → restore this profile's saved default"
          }
        >
          Revert to default
        </Button>
        {/* custom profiles only: lock the current build in as this profile's default */}
        {state && !isBranded && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !voice}
            onClick={() => setDefault()}
            title="Lock the current build in as this custom profile's default (revert restores it)"
          >
            Set as default
          </Button>
        )}
      </div>

      {/* status */}
      {error && <p className="text-xs text-red-600">⚠ {error}</p>}
      {enroll && (
        <pre
          className={cn(
            'max-h-32 overflow-auto rounded-lg bg-primary-50 p-2 text-xs',
            enroll.ok ? 'text-primary-700' : 'text-amber-700',
          )}
        >
          {enroll.ok ? '✓ enrolled (mic path)\n' : '⏳ enroll pending\n'}
          {enroll.output}
        </pre>
      )}
    </section>
  )
}
