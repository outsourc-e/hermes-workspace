import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as yaml from 'yaml'
import { isAuthenticated } from '../../server/auth-middleware'
import { getLocalBinDir, getProfilesDir } from '../../server/claude-paths'
import { formatSwarmWorkerLabel, isSwarmWorkerId, resolveSwarmWorkerDisplayName, rosterByWorkerId } from '../../server/swarm-roster'
import type { SwarmRosterWorker } from '../../server/swarm-roster'

export type WorkerModelAuthStatus = 'ready' | 'primary-auth-failed' | 'fallback-active' | 'not-configured' | 'unknown'

export type WorkerHealth = {
  workerId: string
  displayName: string
  humanLabel: string
  role: string
  specialty: string | null
  mission: string | null
  skills: Array<string>
  capabilities: Array<string>
  profileFound: boolean
  wrapperFound: boolean
  model: string
  provider: string
  recentAuthErrors: number
  recentFallbacks: number
  lastErrorAt: string | null
  lastErrorMessage: string | null
  lastFallbackAt: string | null
  lastFallbackMessage: string | null
  modelAuthStatus: WorkerModelAuthStatus
  primaryAuthOk: boolean | null
  fallbackActive: boolean
  fallbackProvider: string | null
  fallbackModel: string | null
}

export type SwarmHealthSummary = {
  totalWorkers: number
  wrappersConfigured: number
  totalAuthErrors24h: number
  totalFallbacks24h: number
  workersUsingFallback: number
  workersPrimaryAuthFailed: number
  distinctModels: Array<string>
  distinctProviders: Array<string>
  degraded: boolean
  warnings: Array<string>
}

export function resolveWorkerWrapperName(workerId: string, worker?: Pick<SwarmRosterWorker, 'wrapper'> | null): string {
  return worker?.wrapper?.trim() || workerId
}

function listSwarmIds(): Array<string> {
  const dir = getProfilesDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => isSwarmWorkerId(name))
    .sort()
}

function readWorkerConfig(profilePath: string): { model: string; provider: string } {
  const configPath = join(profilePath, 'config.yaml')
  if (!existsSync(configPath)) return { model: 'unknown', provider: 'unknown' }
  try {
    const raw = yaml.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    const modelVal = raw.model
    if (typeof modelVal === 'object' && modelVal !== null) {
      const obj = modelVal as Record<string, unknown>
      return {
        model: String(obj.default ?? obj.name ?? 'unknown'),
        provider: String(obj.provider ?? raw.provider ?? 'unknown'),
      }
    }
    return {
      model: String(modelVal ?? 'unknown'),
      provider: String(raw.provider ?? 'unknown'),
    }
  } catch {
    return { model: 'unknown', provider: 'unknown' }
  }
}

function formatModelDisplay(model: string, provider: string): string {
  const value = `${model} ${provider}`.toLowerCase()
  if (value.includes('claude-opus-4-7') || value.includes('opus-4-7')) return 'Opus 4.7'
  if (value.includes('claude-opus-4-6') || value.includes('opus-4-6')) return 'Opus 4.6'
  if (value.includes('gpt-5.5')) return 'GPT-5.5'
  if (value.includes('gpt-5.4')) return 'GPT-5.4'
  if (value.includes('gpt-5.3')) return 'GPT-5.3'
  return model === 'unknown' ? provider : model
}

function formatProviderDisplay(provider: string): string {
  const value = provider.toLowerCase()
  if (value.includes('anthropic-billing-proxy')) return 'Anthropic Opus'
  if (value.includes('openai-codex')) return 'OpenAI Codex'
  if (value === 'unknown') return 'Unknown'
  return provider.replace(/^custom:/, '').replace(/[-_]/g, ' ')
}

export function parseModelAuthEventsFromText(text: string): {
  authErrorCount: number
  fallbackCount: number
  lastAuthErrorAt: string | null
  lastAuthErrorMessage: string | null
  lastFallbackAt: string | null
  lastFallbackMessage: string | null
  fallbackProvider: string | null
  fallbackModel: string | null
  modelAuthStatus: WorkerModelAuthStatus
  primaryAuthOk: boolean | null
} {
  const authPatterns = [
    /primary provider auth failed/i,
    /no codex credentials/i,
    /no .*oauth token found/i,
    /copilot token validation failed/i,
    /classic pat|classic personal access token/i,
    /\b401\b/i,
    /\bunauthorized\b/i,
    /\bauthentication\b/i,
  ]
  const fallbackPatterns = [
    /falling through to fallback:\s*([^/\s]+)\/([^\s]+)/i,
    /fallback:\s*([^/\s]+)\/([^\s]+)/i,
  ]
  let authErrorCount = 0
  let fallbackCount = 0
  let lastAuthErrorAt: string | null = null
  let lastAuthErrorMessage: string | null = null
  let lastFallbackAt: string | null = null
  let lastFallbackMessage: string | null = null
  let fallbackProvider: string | null = null
  let fallbackModel: string | null = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:,\d{3})?/)
    const ts = tsMatch?.[1] ?? null
    if (authPatterns.some((pattern) => pattern.test(line))) {
      authErrorCount += 1
      lastAuthErrorAt = ts
      lastAuthErrorMessage = line.slice(0, 320)
    }
    for (const pattern of fallbackPatterns) {
      const match = line.match(pattern)
      if (!match) continue
      fallbackCount += 1
      fallbackProvider = match[1]
      fallbackModel = match[2]
      lastFallbackAt = ts
      lastFallbackMessage = line.slice(0, 320)
      break
    }
  }
  const fallbackActive = fallbackCount > 0
  const authFailed = authErrorCount > 0
  return {
    authErrorCount,
    fallbackCount,
    lastAuthErrorAt,
    lastAuthErrorMessage,
    lastFallbackAt,
    lastFallbackMessage,
    fallbackProvider,
    fallbackModel,
    modelAuthStatus: fallbackActive ? 'fallback-active' : authFailed ? 'primary-auth-failed' : 'unknown',
    primaryAuthOk: authFailed || fallbackActive ? false : null,
  }
}

function scanRecentAuthErrors(profilePath: string): ReturnType<typeof parseModelAuthEventsFromText> {
  const errorsLog = join(profilePath, 'logs', 'errors.log')
  if (!existsSync(errorsLog)) {
    return parseModelAuthEventsFromText('')
  }
  try {
    const buffer = readFileSync(errorsLog, 'utf-8')
    const tail = buffer.length > 64_000 ? buffer.slice(-64_000) : buffer
    return parseModelAuthEventsFromText(tail)
  } catch {
    return parseModelAuthEventsFromText('')
  }
}

export function summarizeSwarmHealth(workers: Array<WorkerHealth>): SwarmHealthSummary {
  const totalAuthErrors = workers.reduce((sum, worker) => sum + worker.recentAuthErrors, 0)
  const totalFallbacks = workers.reduce((sum, worker) => sum + worker.recentFallbacks, 0)
  const workersUsingFallback = workers.filter((worker) => worker.fallbackActive).length
  const workersPrimaryAuthFailed = workers.filter((worker) => worker.primaryAuthOk === false || worker.modelAuthStatus === 'primary-auth-failed' || worker.modelAuthStatus === 'fallback-active').length
  const distinctModels = Array.from(new Set(workers.map((w) => formatModelDisplay(w.model, w.provider)))).filter((value) => value !== 'unknown')
  const distinctProviders = Array.from(new Set(workers.map((w) => formatProviderDisplay(w.provider)))).filter((value) => value !== 'unknown')
  const warnings: Array<string> = []
  if (workersUsingFallback > 0) warnings.push(`${workersUsingFallback} worker(s) used fallback model; primary model auth is degraded.`)
  if (workersPrimaryAuthFailed > 0) warnings.push(`${workersPrimaryAuthFailed} worker(s) have primary auth failures.`)
  return {
    totalWorkers: workers.length,
    wrappersConfigured: workers.filter((w) => w.wrapperFound).length,
    totalAuthErrors24h: totalAuthErrors,
    totalFallbacks24h: totalFallbacks,
    workersUsingFallback,
    workersPrimaryAuthFailed,
    distinctModels,
    distinctProviders,
    degraded: totalAuthErrors > 0 || totalFallbacks > 0 || workersPrimaryAuthFailed > 0,
    warnings,
  }
}

function hasOpenAiCodexAuth(profilePath: string): boolean {
  const authPath = join(profilePath, 'auth.json')
  if (!existsSync(authPath)) return false
  try {
    const raw = JSON.parse(readFileSync(authPath, 'utf-8')) as Record<string, unknown>
    const providers = raw.providers && typeof raw.providers === 'object' ? raw.providers as Record<string, unknown> : raw
    const codex = providers['openai-codex']
    if (!codex || typeof codex !== 'object') return false
    const tokens = (codex as Record<string, unknown>).tokens
    return Boolean(tokens && typeof tokens === 'object' && (tokens as Record<string, unknown>).access_token && (tokens as Record<string, unknown>).refresh_token)
  } catch {
    return false
  }
}

export const Route = createFileRoute('/api/swarm-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const workspaceModel = formatModelDisplay(process.env.HERMES_DEFAULT_MODEL ?? process.env.CLAUDE_DEFAULT_MODEL ?? 'unknown', (process.env.HERMES_API_URL ?? process.env.CLAUDE_API_URL)?.includes('anthropic') ? 'anthropic' : 'unknown')
        const apiUrl = process.env.HERMES_API_URL ?? process.env.CLAUDE_API_URL ?? null
        const profilesBase = getProfilesDir()
        const swarmIds = listSwarmIds()
        const wrapperBase = getLocalBinDir()
        const roster = rosterByWorkerId(swarmIds)

        const workers: Array<WorkerHealth> = swarmIds.map((id) => {
          const worker = roster.get(id)
          const profilePath = join(profilesBase, id)
          const wrapperName = resolveWorkerWrapperName(id, worker)
          const wrapperPath = join(wrapperBase, wrapperName)
          const config = readWorkerConfig(profilePath)
          const errs = scanRecentAuthErrors(profilePath)
          const primaryReady = errs.authErrorCount === 0 && errs.fallbackCount === 0 && (config.provider !== 'openai-codex' || hasOpenAiCodexAuth(profilePath))
          return {
            workerId: id,
            displayName: resolveSwarmWorkerDisplayName(id, worker),
            humanLabel: formatSwarmWorkerLabel(id, worker),
            role: worker?.role?.trim() || 'Worker',
            specialty: worker?.specialty?.trim() || null,
            mission: worker?.mission?.trim() || null,
            skills: worker?.skills?.length ? worker.skills : [],
            capabilities: worker?.capabilities?.length ? worker.capabilities : [],
            profileFound: existsSync(profilePath),
            wrapperFound: existsSync(wrapperPath),
            model: config.model,
            provider: config.provider,
            recentAuthErrors: errs.authErrorCount,
            recentFallbacks: errs.fallbackCount,
            lastErrorAt: errs.lastAuthErrorAt,
            lastErrorMessage: errs.lastAuthErrorMessage,
            lastFallbackAt: errs.lastFallbackAt,
            lastFallbackMessage: errs.lastFallbackMessage,
            modelAuthStatus: primaryReady ? 'ready' : errs.modelAuthStatus,
            primaryAuthOk: primaryReady ? true : errs.primaryAuthOk,
            fallbackActive: errs.fallbackCount > 0,
            fallbackProvider: errs.fallbackProvider,
            fallbackModel: errs.fallbackModel,
          }
        })

        const summary = summarizeSwarmHealth(workers)

        return json({
          checkedAt: Date.now(),
          workspaceModel,
          agentApiUrl: apiUrl,
          claudeApiUrl: apiUrl,
          workers,
          summary,
        })
      },
    },
  },
})