import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'

const ENV_PATH = process.env.HUD_ENV_FILE || '/root/hermes-workspace/.env'

/**
 * Rotate the workspace password (HERMES_PASSWORD) or tailnet PIN (HERMES_TAILNET_PIN).
 *
 * Requires an already-authenticated session.
 *
 * POST /api/auth/rotate-password
 *   body: { kind?: 'password' | 'pin', value?: string }
 *
 * - kind defaults to 'password'
 * - value optional: if absent, generates a random one
 *   - 'password' → 32 random bytes (base64url)
 *   - 'pin'      → random 4-digit string
 *
 * Effects:
 *   1. Writes the new value to ENV_PATH (replacing the existing line, or appending if absent)
 *   2. Mutates process.env so the change takes effect immediately for subsequent requests
 *   3. Returns the new value once (only time it's revealed)
 *
 * NOTE: rotating invalidates other sessions on the next request (current session
 * cookie is still valid because the session token store is independent of the
 * password). Use /api/auth/logout from those other devices if you want them out.
 */
export const Route = createFileRoute('/api/auth/rotate-password')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json(
            { ok: false, error: 'Authentication required' },
            { status: 401 },
          )
        }

        const body = (await request.json().catch(() => ({}))) as {
          kind?: 'password' | 'pin'
          value?: string
        }
        const kind = body.kind ?? 'password'
        const envKey = kind === 'pin' ? 'HERMES_TAILNET_PIN' : 'HERMES_PASSWORD'

        let value = (body.value ?? '').trim()
        if (!value) {
          if (kind === 'pin') {
            // 4 digits, leading zeros allowed
            const n = randomBytes(2).readUInt16BE(0) % 10000
            value = String(n).padStart(4, '0')
          } else {
            value = randomBytes(32).toString('base64url')
          }
        } else if (kind === 'pin' && !/^\d{4}$/.test(value)) {
          return json(
            { ok: false, error: 'PIN must be exactly 4 digits' },
            { status: 400 },
          )
        } else if (kind === 'password' && value.length < 8) {
          return json(
            { ok: false, error: 'Password must be at least 8 characters' },
            { status: 400 },
          )
        }

        // Update the .env file (replace existing line or append)
        let envContent = ''
        try {
          envContent = readFileSync(ENV_PATH, 'utf8')
        } catch {
          // .env doesn't exist — we'll create it
        }
        const lineRe = new RegExp(`^${envKey}=.*$`, 'm')
        if (lineRe.test(envContent)) {
          envContent = envContent.replace(lineRe, `${envKey}=${value}`)
        } else {
          envContent +=
            (envContent.endsWith('\n') || envContent === '' ? '' : '\n') +
            `${envKey}=${value}\n`
        }
        writeFileSync(ENV_PATH, envContent, { encoding: 'utf8', mode: 0o600 })

        // Mutate process.env so the change takes effect without restart
        process.env[envKey] = value

        return json({
          ok: true,
          kind,
          value,
          note:
            kind === 'pin'
              ? 'PIN works only from tailnet (100.x.x.x), loopback, or LAN.'
              : 'Existing 30-day session cookies remain valid; new logins use the new password.',
        })
      },
    },
  },
})
