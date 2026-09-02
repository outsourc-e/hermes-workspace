import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  readHermesConfigFiles,
  resolveHermesConfigPaths,
} from '../../server/hermes-config-store'

type RecordLike = Record<string, unknown>

function readRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/api/speech')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = (await request.json()) as { text?: unknown }
          const text = readString(body.text)

          if (!text) {
            return json(
              { ok: false, error: 'Missing text.' },
              { status: 400 },
            )
          }

          const paths = resolveHermesConfigPaths()
          const { config, env } = readHermesConfigFiles(paths)

          const tts = readRecord(config.tts)
          const provider = readString(tts.provider) || 'edge'

          if (provider !== 'openai') {
            return json(
              {
                ok: false,
                error: `Configured TTS provider "${provider}" is not supported by Workspace speech playback.`,
              },
              { status: 400 },
            )
          }

          const openai = readRecord(tts.openai)

          const model = readString(openai.model) || 'tts-1'
          const voice = readString(openai.voice) || 'alloy'
          const baseUrl =
            readString(openai.base_url) ||
            'https://api.openai.com/v1'

          const consentAttestation =
            readString(openai.consent_attestation)

          const language =
            readString(openai.language)

          const apiKey =
            readString(process.env.VOICE_TOOLS_OPENAI_KEY) ||
            readString(env.VOICE_TOOLS_OPENAI_KEY) ||
            readString(process.env.OPENAI_API_KEY) ||
            readString(env.OPENAI_API_KEY)

          if (!apiKey) {
            return json(
              {
                ok: false,
                error:
                  'OpenAI TTS is configured but VOICE_TOOLS_OPENAI_KEY or OPENAI_API_KEY is missing.',
              },
              { status: 400 },
            )
          }

          const payload: Record<string, unknown> = {
            model,
            voice,
            input: text,
            response_format: 'mp3',
          }

          if (consentAttestation) {
            payload.consent_attestation = consentAttestation
          }

          if (language) {
            payload.lang_code = language
          }

          const upstream = await fetch(`${baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (!upstream.ok) {
            const error = await upstream.text()

            return json(
              {
                ok: false,
                error:
                  error ||
                  `Speech request failed (${upstream.status}).`,
              },
              { status: upstream.status },
            )
          }

          const audio = await upstream.arrayBuffer()

          return new Response(audio, {
            status: 200,
            headers: {
              'Content-Type':
                upstream.headers.get('content-type') || 'audio/mpeg',
              'Cache-Control': 'no-store',
            },
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Speech synthesis failed.',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
