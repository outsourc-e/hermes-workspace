import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  createExpiredSessionCookie,
  createSessionCookie,
  getSessionExpiry,
  getSessionTokenFromCookie,
  isPasswordProtectionEnabled,
  isValidSessionToken,
  touchSessionToken,
} from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

export const Route = createFileRoute('/api/auth/refresh')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrf = requireJsonContentType(request)
        if (csrf) return csrf

        // Mode reverse-proxy / local : rien à renouveler, mais surtout PAS d'erreur.
        if (!isPasswordProtectionEnabled()) {
          return json(
            { ok: true, authRequired: false, authenticated: true },
            { status: 200, headers: { 'Cache-Control': 'no-store' } },
          )
        }

        const ip = getClientIp(request)
        if (!rateLimit(`auth-refresh:${ip}`, 30, 60_000)) return rateLimitResponse()

        const token = getSessionTokenFromCookie(request.headers.get('cookie'))
        if (!token || !isValidSessionToken(token)) {
          return json(
            { ok: false, error: 'Unauthorized', authRequired: true, authenticated: false },
            {
              status: 401,
              headers: {
                'X-Hermes-Auth': 'required',
                'Cache-Control': 'no-store',
                'Set-Cookie': createExpiredSessionCookie(),
              },
            },
          )
        }

        const renewed = touchSessionToken(token)
        const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
        if (renewed) headers['Set-Cookie'] = createSessionCookie(token)

        return json(
          {
            ok: true,
            authRequired: true,
            authenticated: true,
            expiresAt: getSessionExpiry(token),
          },
          { status: 200, headers },
        )
      },
    },
  },
})
