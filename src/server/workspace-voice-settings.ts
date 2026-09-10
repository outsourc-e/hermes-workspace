import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_TTS_CHUNK_SIZE = 300
export const MIN_TTS_CHUNK_SIZE = 100
export const MAX_TTS_CHUNK_SIZE = 2000

type WorkspaceVoiceSettings = {
  tts: {
    chunk_size: number
  }
}

function getSettingsPath(): string {
  const hermesHome =
    process.env.HERMES_HOME?.trim() || path.join(os.homedir(), '.hermes')

  return path.join(hermesHome, 'workspace-voice-settings.json')
}

function normalizeChunkSize(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TTS_CHUNK_SIZE
  }

  return Math.min(
    MAX_TTS_CHUNK_SIZE,
    Math.max(MIN_TTS_CHUNK_SIZE, Math.round(parsed)),
  )
}

export function readWorkspaceVoiceSettings(): WorkspaceVoiceSettings {
  const settingsPath = getSettingsPath()

  try {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      tts?: {
        chunk_size?: unknown
      }
    }

    return {
      tts: {
        chunk_size: normalizeChunkSize(parsed.tts?.chunk_size),
      },
    }
  } catch {
    return {
      tts: {
        chunk_size: DEFAULT_TTS_CHUNK_SIZE,
      },
    }
  }
}

export function writeWorkspaceVoiceSettings(
  value: unknown,
): WorkspaceVoiceSettings {
  const settingsPath = getSettingsPath()

  const input =
    value && typeof value === 'object'
      ? (value as {
          tts?: {
            chunk_size?: unknown
          }
        })
      : {}

  const settings: WorkspaceVoiceSettings = {
    tts: {
      chunk_size: normalizeChunkSize(input.tts?.chunk_size),
    },
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })

  const temporaryPath = `${settingsPath}.tmp`

  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(settings, null, 2)}\n`,
    'utf8',
  )

  fs.renameSync(temporaryPath, settingsPath)

  return settings
}
