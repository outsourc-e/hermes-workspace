/**
 * Proxy endpoint — returns available task assignees.
 * Reads agent profiles from the Hermes Agent gateway and combines with the
 * configured human reviewer name (tasks.human_reviewer in config.yaml).
 * Falls back to profile directory listing if the gateway doesn't have
 * a /api/tasks/assignees endpoint.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { BEARER_TOKEN, CLAUDE_API, CLAUDE_DASHBOARD_URL } from '../../server/gateway-capabilities'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import YAML from 'yaml'

type RawAssignee = {
  id?: unknown
  name?: unknown
  label?: unknown
  isHuman?: unknown
  is_human?: unknown
}

type TaskAssignee = {
  id: string
  label: string
  isHuman: boolean
}

const CLAUDE_HOME = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
const CONFIG_PATH = path.join(CLAUDE_HOME, 'config.yaml')
const PROFILES_PATH = path.join(CLAUDE_HOME, 'profiles')

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
        const profilePath = path.join(PROFILES_PATH, name)
        return (
          fs.statSync(profilePath).isDirectory() &&
          fs.existsSync(path.join(profilePath, 'config.yaml'))
        )
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

function titleCaseProfile(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeAssigneePayload(payload: unknown, humanReviewer: string | null): Array<TaskAssignee> {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
  const rawAssignees = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.assignees)
      ? record.assignees
      : []

  const seen = new Set<string>()
  const assignees: Array<TaskAssignee> = []

  for (const raw of rawAssignees) {
    const item = typeof raw === 'string' ? { id: raw, label: raw } : raw as RawAssignee
    const id = typeof item.id === 'string'
      ? item.id
      : typeof item.name === 'string'
        ? item.name
        : null
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label = typeof item.label === 'string' && item.label.trim().length > 0
      ? item.label
      : titleCaseProfile(id)
    assignees.push({
      id,
      label,
      isHuman: item.isHuman === true || item.is_human === true || id === humanReviewer,
    })
  }

  return assignees
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2000),
      headers: authHeaders(),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/claude-tasks-assignees')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }

        const config = readConfig()
        const tasksConfig = (config.tasks ?? {}) as Record<string, unknown>
        const humanReviewer = (tasksConfig.human_reviewer as string) || null

        // Prefer the dashboard plugin endpoint: it is the source used by the
        // Hermes kanban CLI and includes ~/.hermes/profiles plus assignees
        // already present on the board.
        const remotePayload =
          await fetchJson(`${CLAUDE_DASHBOARD_URL}/api/plugins/kanban/assignees`) ??
          await fetchJson(`${CLAUDE_API}/api/tasks/assignees`)
        const remoteAssignees = remotePayload
          ? normalizeAssigneePayload(remotePayload, humanReviewer)
          : []

        const profiles = getProfileNames()
        const merged = new Map<string, TaskAssignee>()
        for (const assignee of remoteAssignees) {
          merged.set(assignee.id, assignee)
        }
        for (const id of profiles) {
          if (!merged.has(id)) {
            merged.set(id, { id, label: titleCaseProfile(id), isHuman: id === humanReviewer })
          }
        }
        if (humanReviewer && !merged.has(humanReviewer)) {
          merged.set(humanReviewer, {
            id: humanReviewer,
            label: titleCaseProfile(humanReviewer),
            isHuman: true,
          })
        }

        const assignees = Array.from(merged.values()).sort((a, b) => {
          if (a.isHuman !== b.isHuman) return a.isHuman ? -1 : 1
          return a.label.localeCompare(b.label)
        })

        return new Response(
          JSON.stringify({ assignees, humanReviewer }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
