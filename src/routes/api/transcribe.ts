import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  safeErrorMessage,
} from '../../server/rate-limit'
import { getConfig } from '../../server/claude-api'
import {
  extractTranscriptionText,
  resolveTranscriptionTarget,
} from '../../server/stt-transcription'

const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024

export const Route = createFileRoute('/api/transcribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`transcribe:${ip}`, 20, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const contentType = request.headers.get('content-type') || ''
          if (!contentType.includes('multipart/form-data')) {
            return json(
              { ok: false, error: 'Expected multipart/form-data upload.' },
              { status: 400 },
            )
          }

          const form = await request.formData()
          const file = form.get('file')
          if (!(file instanceof File)) {
            return json({ ok: false, error: 'Missing audio file.' }, { status: 400 })
          }
          if (file.size <= 0) {
            return json({ ok: false, error: 'Audio file is empty.' }, { status: 400 })
          }
          if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
            return json(
              { ok: false, error: 'Audio file exceeds 25 MB limit.' },
              { status: 413 },
            )
          }

          const config = await getConfig()
          const target = resolveTranscriptionTarget(config)
          if (target.ok === false) {
            return json({ ok: false, error: target.error }, { status: 400 })
          }

          const upstreamForm = new FormData()
          upstreamForm.set('file', file, file.name || 'voice-note.webm')
          upstreamForm.set('model', target.model)
          if (target.language) {
            upstreamForm.set('language', target.language)
          }

          const upstream = await fetch(`${target.baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${target.apiKey}`,
            },
            body: upstreamForm,
          })

          const raw = await upstream.text()
          if (!upstream.ok) {
            return json(
              {
                ok: false,
                error: raw || `Transcription request failed (${upstream.status}).`,
              },
              { status: upstream.status },
            )
          }

          let parsed: unknown = { text: raw }
          try {
            parsed = raw ? JSON.parse(raw) : {}
          } catch {
            parsed = { text: raw }
          }

          const text = extractTranscriptionText(parsed)
          if (!text) {
            return json(
              { ok: false, error: 'Transcription provider returned no text.' },
              { status: 502 },
            )
          }

          return json({
            ok: true,
            provider: target.provider,
            model: target.model,
            language: target.language || null,
            text,
          })
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 500 },
          )
        }
      },
    },
  },
})
