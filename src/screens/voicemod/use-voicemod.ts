/**
 * useVoiceMod — client hook for the VoiceMod panel.
 *
 * Fleet carry-on (new files only; no upstream merge surface). Talks to /api/voicemod.
 * Plain fetch + state so it has no dependency on the app's query setup.
 */
import { useCallback, useEffect, useState } from 'react'

export type VoiceEngine = 'cosy' | 'qwen'

export interface AvailableVoices {
  cosy: Array<string>
  qwen: Array<string>
}

export interface ProfileVoiceState {
  profile: string
  overlay: { voice?: string; engine?: VoiceEngine; flair?: string } | null
  seed: number | null
  hasCustomKit: boolean
  /** true => protected branded reference default; false => custom (offer "Set as default") */
  hasCoreKit: boolean
  mood: string | null
  palette: Array<string>
  flair: string | null
}

export interface EnrollResult {
  ok: boolean
  output: string
}

interface SaveInput {
  voice: string
  engine: VoiceEngine
  flair?: string
  /** save=true also runs the mic-path ID-stamp enroll track */
  save?: boolean
}

export function useVoiceMod(profile: string | null) {
  const [voices, setVoices] = useState<AvailableVoices>({ cosy: [], qwen: [] })
  const [state, setState] = useState<ProfileVoiceState | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enroll, setEnroll] = useState<EnrollResult | null>(null)

  const refresh = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/voicemod?profile=${encodeURIComponent(profile)}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed to load voice config')
      setVoices(data.voices)
      setState(data.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!profile) return
      setBusy(true)
      setError(null)
      setEnroll(null)
      try {
        const res = await fetch('/api/voicemod', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profile, ...payload }),
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error ?? 'Request failed')
        if (data.enroll) setEnroll(data.enroll as EnrollResult)
        if (data.profile) setState(data.profile)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [profile],
  )

  const save = useCallback(
    (input: SaveInput) =>
      post({
        action: input.save ? 'save' : 'alter',
        voice: input.voice,
        engine: input.engine,
        flair: input.flair,
      }),
    [post],
  )

  const reset = useCallback(() => post({ action: 'reset' }), [post])

  const setDefault = useCallback(() => post({ action: 'set-default' }), [post])

  const setSeed = useCallback(
    (input: { seed?: number; release?: boolean }) =>
      post({ action: 'set-seed', seed: input.seed, release: input.release }),
    [post],
  )

  return { voices, state, loading, busy, error, enroll, refresh, save, reset, setDefault, setSeed }
}
