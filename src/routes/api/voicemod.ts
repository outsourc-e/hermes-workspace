/**
 * /api/voicemod — Hermes fleet carry-on route (not upstream).
 *
 * Drives the real voice backends via src/server/voicemod.ts. New file → no merge
 * surface. See that module's header for the carry/merge rationale.
 *
 *   GET  /api/voicemod                 → { ok, voices }
 *   GET  /api/voicemod?profile=claudia → { ok, voices, profile: ProfileVoiceState }
 *   POST /api/voicemod  { action, profile, voice?, engine?, flair? }
 *        action = 'alter' | 'reset' | 'save'
 *        save = alter (write overlay) + mic-path enroll (ID-stamp track)
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  safeErrorMessage,
} from '../../server/rate-limit'
import {
  alterVoice,
  enrollViaMicPath,
  getProfileVoice,
  listVoices,
  resetVoice,
  setDefaultVoice,
  type VoiceEngine,
  type VoiceOverlay,
} from '../../server/voicemod'

interface VoiceModPost {
  action?: 'alter' | 'reset' | 'save' | 'set-default'
  profile?: string
  voice?: string
  engine?: VoiceEngine
  flair?: string
}

export const Route = createFileRoute('/api/voicemod')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const profile = url.searchParams.get('profile')
          const voices = await listVoices()
          if (profile) {
            return json({ ok: true, voices, profile: await getProfileVoice(profile) })
          }
          return json({ ok: true, voices })
        } catch (err) {
          return json({ ok: false, error: safeErrorMessage(err) }, { status: 500 })
        }
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const ip = getClientIp(request)
        // mic-path enroll plays audio + touches the voice store — keep it modest.
        if (!rateLimit(`voicemod:${ip}`, 10, 60_000)) {
          return rateLimitResponse()
        }

        let body: VoiceModPost
        try {
          body = (await request.json()) as VoiceModPost
        } catch {
          return json({ ok: false, error: 'Expected JSON body.' }, { status: 400 })
        }

        const { action, profile } = body
        if (!profile) {
          return json({ ok: false, error: 'Missing profile.' }, { status: 400 })
        }

        try {
          if (action === 'reset') {
            await resetVoice(profile)
            return json({ ok: true, profile: await getProfileVoice(profile) })
          }

          if (action === 'set-default') {
            const result = await setDefaultVoice(profile)
            return json({ ok: true, enroll: result, profile: await getProfileVoice(profile) })
          }

          if (action === 'alter' || action === 'save') {
            const overlay: VoiceOverlay = {
              voice: body.voice,
              engine: body.engine,
              flair: body.flair,
            }
            await alterVoice(profile, overlay)

            // 'save' additionally runs the ID-stamp track through the mic path.
            let enroll = null
            if (action === 'save') {
              if (!body.voice || !body.engine) {
                return json(
                  { ok: false, error: 'save requires voice + engine for the enroll track.' },
                  { status: 400 },
                )
              }
              enroll = await enrollViaMicPath(profile, body.voice, body.engine)
            }
            return json({
              ok: true,
              enroll,
              profile: await getProfileVoice(profile),
            })
          }

          return json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
        } catch (err) {
          return json({ ok: false, error: safeErrorMessage(err) }, { status: 500 })
        }
      },
    },
  },
})
