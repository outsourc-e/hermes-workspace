import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'yaml'
import { isAuthenticated } from '../../server/auth-middleware'
import { getLocalBinDir, getProfilesDir } from '../../server/claude-paths'

type WorkerHealth = {
  workerId: string
  profileFound: boolean
  wrapperFound: boolean
  model: string
  provider: string
  recentAuthErrors: number
  lastErrorAt: string | null
  lastErrorMessage: string | null
}

function listSwarmIds(): string[] {
  const dir = getProfilesDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^swarm\d+$/i.test(name))
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

function scanRecentAuthErrors(profilePath: string): {
  count: number
  lastAt: string | null
  lastMessage: string | null
} {
  const errorsLog = join(profilePath, 'logs', 'errors.log')
  if (!existsSync(errorsLog)) return { count: 0, lastAt: null, lastMessage: null }
  try {
    const stat = statSync(errorsLog)
    const buffer = readFileSync(errorsLog, 'utf-8')
    const tail = buffer.length > 64_000 ? buffer.slice(-64_000) : buffer
    const lines = tail.split('\n')
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000
    let count = 0
    let lastAt: string | null = null
    let lastMessage: string | null = null
    for (const line of lines) {
      if (!line.includes('401') && !line.toLowerCase().includes('authentication')) continue
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)
      if (!tsMatch) continue
      const ts = new Date(tsMatch[1].replace(' ', 'T') + 'Z')
      if (Number.isFinite(ts.getTime()) && ts.getTime() < cutoffMs) continue
      count += 1
      lastAt = tsMatch[1]
      lastMessage = line.slice(0, 320)
    }
    if (count === 0) {
      // Honor last-modified file timestamp as a hint if no parseable lines but file changed recently.
      if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) {
        // Leave count 0; UI shows fresh log activity separately if needed.
      }
    }
    return { count, lastAt, lastMessage }
  } catch {
    return { count: 0, lastAt: null, lastMessage: null }
  }
}

export const Route = createFileRoute('/api/swarm-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const workspaceModel = formatModelDisplay(process.env.CLAUDE_DEFAULT_MODEL ?? 'unknown', process.env.CLAUDE_API_URL?.includes('anthropic') ? 'anthropic' : 'unknown')
        const apiUrl = process.env.CLAUDE_API_URL ?? null
        const profilesBase = getProfilesDir()
        const swarmIds = listSwarmIds()
        const wrapperBase = getLocalBinDir()

        const workers: WorkerHealth[] = swarmIds.map((id) => {
          const profilePath = join(profilesBase, id)
          const wrapperPath = join(wrapperBase, id)
          const config = readWorkerConfig(profilePath)
          const errs = scanRecentAuthErrors(profilePath)
          return {
            workerId: id,
            profileFound: existsSync(profilePath),
            wrapperFound: existsSync(wrapperPath),
            model: config.model,
            provider: config.provider,
            recentAuthErrors: errs.count,
            lastErrorAt: errs.lastAt,
            lastErrorMessage: errs.lastMessage,
          }
        })

        const totalAuthErrors = workers.reduce((sum, worker) => sum + worker.recentAuthErrors, 0)
        const distinctModels = Array.from(new Set(workers.map((w) => formatModelDisplay(w.model, w.provider)))).filter((value) => value !== 'unknown')
        const distinctProviders = Array.from(new Set(workers.map((w) => formatProviderDisplay(w.provider)))).filter((value) => value !== 'unknown')

        return json({
          checkedAt: Date.now(),
          workspaceModel,
          claudeApiUrl: apiUrl,
          workers,
          summary: {
            totalWorkers: workers.length,
            wrappersConfigured: workers.filter((w) => w.wrapperFound).length,
            totalAuthErrors24h: totalAuthErrors,
            distinctModels,
            distinctProviders,
          },
        })
      },
    },
  },
})
