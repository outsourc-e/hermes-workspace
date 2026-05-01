/**
 * Proxy endpoint — returns available task assignees.
 * Reads agent profiles from the Hermes Agent gateway and combines with the
 * configured human reviewer name (tasks.human_reviewer in config.yaml).
 * Falls back to profile directory listing if the gateway doesn't have
 * a /api/tasks/assignees endpoint.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { BEARER_TOKEN, CLAUDE_API } from '../../server/gateway-capabilities'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import YAML from 'yaml'

const CLAUDE_HOME = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
const CONFIG_PATH = path.join(CLAUDE_HOME, 'config.yaml')
const PROFILES_PATH = path.join(os.homedir(), '.claude', 'profiles')

function readConfig(): Record<string, unknown> {
  try {
    return (YAML.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}

function getProfileNames(): string[] {
  try {
    return fs.readdirSync(PROFILES_PATH).filter(name => {
      try {
        return fs.statSync(path.join(PROFILES_PATH, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

export const Route = createFileRoute('/api/claude-tasks-assignees')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }

        // Try gateway first — it may have a richer endpoint
        try {
          const res = await fetch(`${CLAUDE_API}/api/tasks/assignees`, {
            signal: AbortSignal.timeout(2000),
            headers: authHeaders(),
          })
          if (res.ok) {
            return new Response(await res.text(), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        } catch {
          // fall through to local profile discovery
        }

        // Fall back: derive from profile directories + config
        const config = readConfig()
        const tasksConfig = (config.tasks ?? {}) as Record<string, unknown>
        const humanReviewer = (tasksConfig.human_reviewer as string) || null
        const profiles = getProfileNames()

        const assignees = profiles.map(id => ({ id, label: id, isHuman: id === humanReviewer }))
        if (humanReviewer && !profiles.includes(humanReviewer)) {
          assignees.unshift({ id: humanReviewer, label: humanReviewer, isHuman: true })
        }

        return new Response(
          JSON.stringify({ assignees, humanReviewer }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
