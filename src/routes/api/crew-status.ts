import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import * as yaml from 'yaml'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import {
  getClaudeRoot,
  getProfileClaudeHome,
  getWorkspaceClaudeHome,
} from '../../server/claude-paths'
import {
  formatSwarmWorkerLabel,
  rosterByWorkerId,
} from '../../server/swarm-roster'
import type { SwarmRosterWorker } from '../../server/swarm-roster'

type CrewDefinition = {
  id: string
  displayName: string
  humanLabel: string
  role: string
  specialty?: string
  mission?: string
  skills?: Array<string>
  capabilities?: Array<string>
  profilePath: string | null
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildCrewDefinitionFromRoster(
  profile: string,
  worker: SwarmRosterWorker | null | undefined,
): CrewDefinition {
  const displayName = worker?.name || titleCase(profile)
  const role = worker?.role || 'Profile'
  return {
    id: profile,
    displayName,
    humanLabel: formatSwarmWorkerLabel(profile, worker),
    role,
    specialty: worker?.specialty || undefined,
    mission: worker?.mission || undefined,
    skills: worker?.skills.length ? worker.skills : undefined,
    capabilities: worker?.capabilities.length ? worker.capabilities : undefined,
    profilePath: profile,
  }
}

function buildCrewDefinitions(): Array<CrewDefinition> {
  const profilesDir = join(getClaudeRoot(), 'profiles')
  const dynamicProfiles = existsSync(profilesDir)
    ? readdirSync(profilesDir, { withFileTypes: true })
        .filter((entry) => {
          const profilePath = join(profilesDir, entry.name)
          if (entry.isDirectory()) return true
          if (!entry.isSymbolicLink()) return false
          try {
            return statSync(profilePath).isDirectory()
          } catch {
            return false
          }
        })
        .map((entry) => entry.name)
        .sort()
    : []

  const roster = rosterByWorkerId(dynamicProfiles)
  return [
    {
      id: 'workspace',
      displayName: 'Workspace',
      humanLabel: 'Workspace — Primary profile',
      role: 'Primary profile',
      profilePath: null,
    },
    ...dynamicProfiles.map((profile) =>
      buildCrewDefinitionFromRoster(
        profile,
        /^swarm\d+$/i.test(profile) ? roster.get(profile) : null,
      ),
    ),
  ]
}

function getClaudeHome(profilePath: string | null): string {
  return profilePath
    ? getProfileClaudeHome(profilePath)
    : getWorkspaceClaudeHome()
}

function readGatewayState(claudeHome: string) {
  const path = join(claudeHome, 'gateway_state.json')
  if (!existsSync(path))
    return {
      pid: null,
      gatewayState: 'unknown',
      platforms: {},
      updatedAt: null,
    }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      pid: raw.pid ?? null,
      gatewayState: raw.gateway_state ?? 'unknown',
      platforms: raw.platforms ?? {},
      updatedAt: raw.updated_at ?? null,
    }
  } catch {
    return {
      pid: null,
      gatewayState: 'unknown',
      platforms: {},
      updatedAt: null,
    }
  }
}

function checkProcessAlive(pid: number | null): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readConfig(claudeHome: string): { model: string; provider: string } {
  const configPath = join(claudeHome, 'config.yaml')
  if (!existsSync(configPath)) return { model: 'unknown', provider: 'unknown' }
  try {
    const raw = yaml.parse(readFileSync(configPath, 'utf-8')) as Record<
      string,
      unknown
    >
    const modelVal = raw.model
    const providerVal = raw.provider

    if (typeof modelVal === 'object' && modelVal !== null) {
      const modelObj = modelVal as Record<string, unknown>
      return {
        model: String(modelObj.default ?? modelObj.name ?? 'unknown'),
        provider: String(modelObj.provider ?? providerVal ?? 'unknown'),
      }
    }

    return {
      model: String(modelVal ?? 'unknown'),
      provider: String(providerVal ?? 'unknown'),
    }
  } catch {
    return { model: 'unknown', provider: 'unknown' }
  }
}

function readCronJobCount(claudeHome: string): number {
  const cronPath = join(claudeHome, 'cron', 'jobs.json')
  if (!existsSync(cronPath)) return 0
  try {
    const jobs = JSON.parse(readFileSync(cronPath, 'utf-8'))
    return Array.isArray(jobs)
      ? jobs.length
      : typeof jobs === 'object' && jobs !== null
        ? Object.keys(jobs).length
        : 0
  } catch {
    return 0
  }
}

async function fetchAssignedTaskCounts(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${CLAUDE_API}/api/tasks?include_done=false`, {
      signal: AbortSignal.timeout(3_000),
      headers: BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {},
    })
    if (!res.ok) return {}

    const data = (await res.json()) as {
      tasks?: Array<{ assignee?: string | null; column?: string | null }>
    }

    const counts: Record<string, number> = {}
    for (const task of data.tasks ?? []) {
      if (!task.assignee || task.column === 'done') continue
      counts[task.assignee] = (counts[task.assignee] ?? 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}

export const Route = createFileRoute('/api/crew-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        await ensureGatewayProbed()
        const taskCounts = await fetchAssignedTaskCounts()
        const crewDefinitions = buildCrewDefinitions()

        const crew = crewDefinitions.map((member) => {
          const claudeHome = getClaudeHome(member.profilePath)
          const profileFound = existsSync(claudeHome)

          if (!profileFound) {
            return {
              id: member.id,
              displayName: member.displayName,
              humanLabel: member.humanLabel,
              role: member.role,
              specialty: member.specialty,
              mission: member.mission,
              skills: member.skills,
              capabilities: member.capabilities,
              profileFound: false,
              gatewayState: 'unknown',
              processAlive: false,
              platforms: {},
              model: 'unknown',
              provider: 'unknown',
              cronJobCount: 0,
              assignedTaskCount: taskCounts[member.id] ?? 0,
            }
          }

          const gatewayInfo = readGatewayState(claudeHome)
          const config = readConfig(claudeHome)

          return {
            id: member.id,
            displayName: member.displayName,
            humanLabel: member.humanLabel,
            role: member.role,
            specialty: member.specialty,
            mission: member.mission,
            skills: member.skills,
            capabilities: member.capabilities,
            profileFound: true,
            gatewayState: gatewayInfo.gatewayState,
            processAlive: checkProcessAlive(gatewayInfo.pid),
            platforms: gatewayInfo.platforms,
            model: config.model,
            provider: config.provider,
            cronJobCount: readCronJobCount(claudeHome),
            assignedTaskCount: taskCounts[member.id] ?? 0,
          }
        })

        return json({ crew, fetchedAt: Date.now() })
      },
    },
  },
})
