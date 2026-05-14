import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo'
const DEFAULT_OPENAI_MODEL = 'whisper-1'

type RecordLike = Record<string, unknown>

type SupportedRemoteProvider = 'groq' | 'openai'

export type ResolvedTranscriptionTarget = {
  ok: true
  provider: SupportedRemoteProvider
  model: string
  language?: string
  apiKey: string
  baseUrl: string
}

export type ResolvedTranscriptionError = {
  ok: false
  error: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : {}
}

export function parseEnvText(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) env[key] = value
  }
  return env
}

export function readHermesEnv(
  envHome = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? join(homedir(), '.hermes'),
): Record<string, string> {
  const envPath = join(envHome, '.env')
  if (!existsSync(envPath)) return {}
  try {
    return parseEnvText(readFileSync(envPath, 'utf8'))
  } catch {
    return {}
  }
}

export function resolveTranscriptionTarget(
  config: RecordLike,
  runtimeEnv: Record<string, string | undefined> = process.env,
  hermesEnv: Record<string, string> = readHermesEnv(),
): ResolvedTranscriptionTarget | ResolvedTranscriptionError {
  const stt = readRecord(config.stt)
  const provider = readString(stt.provider) || 'local'
  const language = readString(stt.language) || undefined

  if (provider === 'groq') {
    const groq = readRecord(stt.groq)
    const apiKey =
      readString(runtimeEnv.GROQ_API_KEY) || readString(hermesEnv.GROQ_API_KEY)
    if (!apiKey) {
      return { ok: false, error: 'Groq STT is configured but GROQ_API_KEY is missing.' }
    }
    return {
      ok: true,
      provider: 'groq',
      model: readString(groq.model) || DEFAULT_GROQ_MODEL,
      language,
      apiKey,
      baseUrl:
        readString(runtimeEnv.GROQ_BASE_URL) ||
        readString(hermesEnv.GROQ_BASE_URL) ||
        DEFAULT_GROQ_BASE_URL,
    }
  }

  if (provider === 'openai') {
    const openai = readRecord(stt.openai)
    const apiKey =
      readString(runtimeEnv.VOICE_TOOLS_OPENAI_KEY) ||
      readString(hermesEnv.VOICE_TOOLS_OPENAI_KEY) ||
      readString(runtimeEnv.OPENAI_API_KEY) ||
      readString(hermesEnv.OPENAI_API_KEY)
    if (!apiKey) {
      return {
        ok: false,
        error: 'OpenAI STT is configured but VOICE_TOOLS_OPENAI_KEY or OPENAI_API_KEY is missing.',
      }
    }
    return {
      ok: true,
      provider: 'openai',
      model:
        readString(openai.model) ||
        readString(runtimeEnv.STT_OPENAI_MODEL) ||
        readString(hermesEnv.STT_OPENAI_MODEL) ||
        DEFAULT_OPENAI_MODEL,
      language,
      apiKey,
      baseUrl:
        readString(runtimeEnv.STT_OPENAI_BASE_URL) ||
        readString(hermesEnv.STT_OPENAI_BASE_URL) ||
        DEFAULT_OPENAI_BASE_URL,
    }
  }

  return {
    ok: false,
    error: `Configured STT provider "${provider}" is not available through Workspace remote transcription.`,
  }
}

export function extractTranscriptionText(payload: unknown): string {
  const record = readRecord(payload)
  const text = readString(record.text)
  if (text) return text
  const choices = Array.isArray(record.choices) ? record.choices : []
  for (const choice of choices) {
    const message = readRecord(readRecord(choice).message)
    const content = readString(message.content)
    if (content) return content
  }
  return ''
}
