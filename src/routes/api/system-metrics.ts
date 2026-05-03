import fs from 'node:fs'
import os from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getConnectionStatus,
} from '../../server/gateway-capabilities'

type SystemMetricsResponse = {
  checkedAt: number
  cpu: {
    loadPercent: number
    loadAverage1m: number
    cores: number
  }
  memory: {
    usedBytes: number
    totalBytes: number
    usedPercent: number
  }
  disk: {
    path: string
    usedBytes: number
    totalBytes: number
    usedPercent: number
  }
  hermes: {
    status: 'connected' | 'enhanced' | 'partial' | 'disconnected'
    health: boolean
    dashboard: boolean
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function readCpu() {
  const cores = Math.max(1, os.cpus().length)
  const loadAverage1m = os.loadavg()[0] ?? 0
  const loadPercent = clampPercent((loadAverage1m / cores) * 100)

  return {
    loadPercent,
    loadAverage1m: Math.round(loadAverage1m * 100) / 100,
    cores,
  }
}

function readMemory() {
  const totalBytes = os.totalmem()
  const freeBytes = os.freemem()
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  const usedPercent = clampPercent((usedBytes / totalBytes) * 100)

  return {
    usedBytes,
    totalBytes,
    usedPercent,
  }
}

function readDisk() {
  const diskPath = process.env.HERMES_WORKSPACE_METRICS_DISK_PATH || os.homedir()

  try {
    const stats = fs.statfsSync(diskPath)
    const totalBytes = stats.blocks * stats.bsize
    const freeBytes = stats.bavail * stats.bsize
    const usedBytes = Math.max(0, totalBytes - freeBytes)
    const usedPercent = totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0

    return {
      path: diskPath,
      usedBytes,
      totalBytes,
      usedPercent,
    }
  } catch {
    return {
      path: diskPath,
      usedBytes: 0,
      totalBytes: 0,
      usedPercent: 0,
    }
  }
}

export const Route = createFileRoute('/api/system-metrics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // isAuthenticated() returns boolean. Don't cast it to Response —
        // that throws at runtime. Match the pattern used by adjacent routes.
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const caps = await ensureGatewayProbed()
        const status = getConnectionStatus()

        const body: SystemMetricsResponse = {
          checkedAt: Date.now(),
          cpu: readCpu(),
          memory: readMemory(),
          disk: readDisk(),
          hermes: {
            status,
            health: caps.health,
            dashboard: caps.dashboard.available,
          },
        }

        return Response.json(body)
      },
    },
  },
})
