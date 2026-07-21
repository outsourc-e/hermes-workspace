import { describe, expect, it } from 'vitest'
import {
  extractTranscriptionText,
  parseEnvText,
  resolveTranscriptionTarget,
} from './stt-transcription'

describe('stt transcription helpers', () => {
  it('parses quoted env values', () => {
    expect(parseEnvText("GROQ_API_KEY='abc123'\nOPENAI_API_KEY=xyz\n")).toEqual({
      GROQ_API_KEY: 'abc123',
      OPENAI_API_KEY: 'xyz',
    })
  })

  it('resolves Groq transcription settings from config and hermes env', () => {
    const result = resolveTranscriptionTarget(
      {
        stt: {
          provider: 'groq',
          language: 'fr',
          groq: { model: 'whisper-large-v3' },
        },
      },
      {},
      { GROQ_API_KEY: 'groq-secret' },
    )

    expect(result).toEqual({
      ok: true,
      provider: 'groq',
      model: 'whisper-large-v3',
      language: 'fr',
      apiKey: 'groq-secret',
      baseUrl: 'https://api.groq.com/openai/v1',
    })
  })

  it('returns an actionable error when Groq is configured without a key', () => {
    expect(
      resolveTranscriptionTarget(
        { stt: { provider: 'groq' } },
        {},
        {},
      ),
    ).toEqual({
      ok: false,
      error: 'Groq STT is configured but GROQ_API_KEY is missing.',
    })
  })

  it('extracts text from OpenAI and choice-based transcription payloads', () => {
    expect(extractTranscriptionText({ text: 'bonjour' })).toBe('bonjour')
    expect(
      extractTranscriptionText({
        choices: [{ message: { content: 'hola' } }],
      }),
    ).toBe('hola')
  })
})
