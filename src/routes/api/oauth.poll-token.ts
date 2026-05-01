import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'

const BodySchema = z.object({
  provider: z.string(),
  deviceCode: z.string(),
})

function saveNousTokens(accessToken: string, refreshToken?: string) {
  const claudeDir =
    process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude')
  const authPath = path.join(claudeDir, 'auth.json')

  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(fs.readFileSync(authPath, 'utf8'))
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  const providers = (existing.providers as Record<string, unknown>) || {}
  providers['nous'] = {
    access_token: accessToken,
    refresh_token: refreshToken || null,
    saved_at: new Date().toISOString(),
  }

  const updated = {
    ...existing,
    providers,
    active_provider: 'nous',
  }

  fs.mkdirSync(claudeDir, { recursive: true })
  fs.writeFileSync(authPath, JSON.stringify(updated, null, 2), 'utf8')
}

export const Route = createFileRoute('/api/oauth/poll-token')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const parsed = BodySchema.safeParse(body)
        if (!parsed.success) {
          return json(
            { error: 'Missing provider or deviceCode' },
            { status: 400 },
          )
        }

        const { provider, deviceCode } = parsed.data

        if (provider === 'nous') {
          try {
            const params = new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              client_id: 'claude-cli',
              device_code: deviceCode,
            })

            const res = await fetch(
              'https://portal.nousresearch.com/api/oauth/token',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
              },
            )

            const data = (await res.json()) as Record<string, unknown>

            if (
              data.error === 'authorization_pending' ||
              data.error === 'slow_down'
            ) {
              return json({ status: 'pending' })
            }

            if (data.error) {
              return json({
                status: 'error',
                message: String(data.error_description || data.error),
              })
            }

            if (data.access_token) {
              saveNousTokens(
                String(data.access_token),
                data.refresh_token ? String(data.refresh_token) : undefined,
              )
              return json({
                status: 'success',
                accessToken: String(data.access_token),
              })
            }

            return json({
              status: 'error',
              message: 'Unexpected response from token endpoint',
            })
          } catch (err) {
            return json({
              status: 'error',
              message: err instanceof Error ? err.message : 'Network error',
            })
          }
        }

        return json({
          status: 'error',
          message: `OAuth device flow not supported for provider: ${provider}`,
        })
      },
    },
  },
})
