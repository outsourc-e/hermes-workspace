import { useCallback, useEffect, useState } from 'react'

const DEFAULT_CHUNK_SIZE = 300

type WorkspaceVoiceSettingsResponse = {
  ok?: boolean
  tts?: {
    chunk_size?: number
  }
}

export function useWorkspaceVoiceSettings() {
  const [ttsChunkSize, setTtsChunkSize] = useState(DEFAULT_CHUNK_SIZE)
  const [ttsChunkSizeLoading, setTtsChunkSizeLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch('/api/workspace-voice-settings')

        if (!response.ok) return

        const payload =
          (await response.json()) as WorkspaceVoiceSettingsResponse

        const value = payload.tts?.chunk_size

        if (
          !cancelled &&
          typeof value === 'number' &&
          Number.isFinite(value)
        ) {
          setTtsChunkSize(value)
        }
      } catch {
        // Keep default value.
      } finally {
        if (!cancelled) {
          setTtsChunkSizeLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const saveTtsChunkSize = useCallback(async (value: number) => {
    const normalized = Math.min(
      2000,
      Math.max(100, Math.round(value)),
    )

    setTtsChunkSize(normalized)

    const response = await fetch('/api/workspace-voice-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tts: {
          chunk_size: normalized,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to save TTS chunk size (${response.status}).`,
      )
    }

    const payload =
      (await response.json()) as WorkspaceVoiceSettingsResponse

    const savedValue = payload.tts?.chunk_size

    if (typeof savedValue === 'number') {
      setTtsChunkSize(savedValue)
    }
  }, [])

  return {
    ttsChunkSize,
    setTtsChunkSize,
    saveTtsChunkSize,
    ttsChunkSizeLoading,
  }
}
