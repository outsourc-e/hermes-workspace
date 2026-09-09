import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import {
  clearSessionCookie,
  createSessionCookie,
  generateSessionToken,
  getSessionTokenFromCookie,
  isPasswordProtectionEnabled,
  revokeSessionToken,
  storeSessionToken,
  verifyPassword,
} from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

const AuthSchema = z.object({
  password: z.string().max(1000),
})

export const Route = createFileRoute('/api/auth')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        // If password protection is disabled, reject auth attempts
        if (!isPasswordProtectionEnabled()) {
          return json(
            { ok: false, error: 'Authentication not required' },
            { status: 400 },
          )
        }

        // Rate limit: max 5 auth attempts per minute per IP
        const ip = getClientIp(request)
        if (!rateLimit(`auth:${ip}`, 5, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const raw = await request.json().catch(() => ({}))
          const parsed = AuthSchema.safeParse(raw)

          if (!parsed.success) {
            return json(
              { ok: false, error: 'Invalid request' },
              { status: 400 },
            )
          }

          const { password } = parsed.data

          // Verify password
          const valid = verifyPassword(password)

          if (!valid) {
            // Add small delay to prevent brute force
            await new Promise((resolve) => setTimeout(resolve, 1000))
            return json(
              { ok: false, error: 'Invalid password' },
              { status: 401 },
            )
          }

          // Generate session token
          const token = generateSessionToken()
          storeSessionToken(token)

          // Return success with Set-Cookie header
          return json(
            { ok: true },
            {
              status: 200,
              headers: {
                'Set-Cookie': createSessionCookie(token),
              },
            },
          )
        } catch (err) {
          if (import.meta.env.DEV) console.error('[/api/auth] Error:', err)
          return json(
            { ok: false, error: 'Authentication failed' },
            { status: 500 },
          )
        }
      },
      DELETE: ({ request }) => {
        // Logout: revoke the session token and clear the cookie.
        // Idempotent — always returns ok even if no valid token was present.
        // CSRF: the session cookie is SameSite=Strict; additionally reject
        // cross-site requests (defense in depth, mirrors requireJsonContentType
        // on the login POST which has no body to check).
        const secFetchSite = request.headers.get('sec-fetch-site')
        if (secFetchSite && secFetchSite === 'cross-site') {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const cookieHeader = request.headers.get('cookie')
        const token = getSessionTokenFromCookie(cookieHeader)
        if (token) {
          revokeSessionToken(token)
        }
        return json(
          { ok: true },
          {
            status: 200,
            headers: {
              'Set-Cookie': clearSessionCookie(),
            },
          },
        )
      },
    },
  },
})
