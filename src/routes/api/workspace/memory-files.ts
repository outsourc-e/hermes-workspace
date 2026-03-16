import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  safeErrorMessage,
} from '../../../server/rate-limit'

type MemorySection = 'workspace' | 'project' | 'agent'

type MemoryFileRecord = {
  name: string
  path: string
  size: string
  section: MemorySection
}

type DateStampedFile = {
  name: string
  fullPath: string
  time: number
}

function getWorkspaceRoot(): string {
  const configured = (
    process.env.HERMES_WORKSPACE ||
    process.env.OPENCLAW_WORKSPACE ||
    ''
  ).trim()
  return path.resolve(
    configured || path.join(os.homedir(), '.hermes'),
  )
}

function formatKilobytes(bytes: number): string {
  const kb = bytes / 1024
  return `${kb < 10 ? kb.toFixed(1) : kb.toFixed(0)} KB`
}

async function statFile(
  fullPath: string,
): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const stats = await fs.stat(fullPath)
    if (!stats.isFile()) return null
    return {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    }
  } catch {
    return null
  }
}

async function maybeFileRecord(
  workspaceRoot: string,
  relativePath: string,
  section: MemorySection,
): Promise<MemoryFileRecord | null> {
  const fullPath = path.join(workspaceRoot, relativePath)
  const stats = await statFile(fullPath)
  if (!stats) return null

  return {
    name: path.basename(relativePath),
    path: relativePath,
    size: formatKilobytes(stats.size),
    section,
  }
}

function extractDateStamp(name: string): number {
  const match = name.match(/(\d{4}-\d{2}-\d{2})/)
  if (!match) return Number.NaN
  const parsed = Date.parse(match[1]!)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

async function getLatestDailyLogs(workspaceRoot: string): Promise<Array<MemoryFileRecord>> {
  const memoryRoot = path.join(workspaceRoot, 'memory')

  let entries: Array<string>
  try {
    entries = await fs.readdir(memoryRoot)
  } catch {
    return []
  }

  const candidates: Array<DateStampedFile> = []

  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.md')) continue
    const fullPath = path.join(memoryRoot, name)
    const stats = await statFile(fullPath)
    if (!stats) continue

    candidates.push({
      name,
      fullPath,
      time: Number.isNaN(extractDateStamp(name))
        ? stats.mtimeMs
        : extractDateStamp(name),
    })
  }

  candidates.sort((a, b) => b.time - a.time || a.name.localeCompare(b.name))

  const topThree = candidates.slice(0, 3)

  const items = await Promise.all(
    topThree.map(async (entry) => {
      const stats = await statFile(entry.fullPath)
      return stats
        ? {
            name: entry.name,
            path: `memory/${entry.name}`,
            size: formatKilobytes(stats.size),
            section: 'project' as const,
          }
        : null
    }),
  )

  return items.filter(
    (item): item is Extract<(typeof items)[number], MemoryFileRecord> =>
      item !== null,
  )
}

export const Route = createFileRoute('/api/workspace/memory-files')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`workspace-memory-files-get:${ip}`, 120, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const workspaceRoot = getWorkspaceRoot()

          const [memoryMd, soulMd, agentsMd, userMd, learningsMd, errorsMd, dailyLogs] =
            await Promise.all([
              maybeFileRecord(workspaceRoot, 'MEMORY.md', 'workspace'),
              maybeFileRecord(workspaceRoot, 'SOUL.md', 'workspace'),
              maybeFileRecord(workspaceRoot, 'AGENTS.md', 'workspace'),
              maybeFileRecord(workspaceRoot, 'USER.md', 'workspace'),
              maybeFileRecord(workspaceRoot, '.learnings/LEARNINGS.md', 'agent'),
              maybeFileRecord(workspaceRoot, '.learnings/ERRORS.md', 'agent'),
              getLatestDailyLogs(workspaceRoot),
            ])

          const files = [
            memoryMd,
            soulMd,
            agentsMd,
            userMd,
            ...dailyLogs,
            learningsMd,
            errorsMd,
          ].filter((item): item is MemoryFileRecord => Boolean(item))

          return json({ files })
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 500 },
          )
        }
      },
    },
  },
})
