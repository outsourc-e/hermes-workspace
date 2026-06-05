import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
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

function cpuTotals() {
  // Sum busy and idle jiffies across every core. The ratio of busy-delta to
  // total-delta over a short window is true utilization — unlike load average,
  // which is a run-queue length (it counts I/O waiters and can exceed 100%).
  let busy = 0
  let idle = 0
  for (const cpu of os.cpus()) {
    busy += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq
    idle += cpu.times.idle
  }
  return { busy, idle }
}

async function readCpu() {
  const cores = Math.max(1, os.cpus().length)
  const loadAverage1m = os.loadavg()[0] ?? 0

  const start = cpuTotals()
  await delay(150)
  const end = cpuTotals()

  const busyDelta = end.busy - start.busy
  const totalDelta = busyDelta + (end.idle - start.idle)
  const loadPercent = totalDelta > 0 ? clampPercent((busyDelta / totalDelta) * 100) : 0

  return {
    loadPercent,
    loadAverage1m: Math.round(loadAverage1m * 100) / 100,
    cores,
  }
}

// On macOS, os.freemem() reports only truly-free pages (often near zero),
// because the kernel keeps inactive/speculative/purgeable pages populated as
// reclaimable cache. Treating that as "used" pins the gauge at ~100%. Parse
// vm_stat to count reclaimable pages as available, matching how Activity
// Monitor and `top` present memory pressure.
function readDarwinAvailableBytes(totalBytes: number): number | null {
  try {
    const output = execFileSync('vm_stat', { encoding: 'utf8', timeout: 1000 })

    const pageSizeMatch = output.match(/page size of (\d+) bytes/)
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096

    const pageStat = (label: string): number => {
      const match = output.match(new RegExp(`${label}:\\s+(\\d+)\\.`))
      return match ? Number(match[1]) : 0
    }

    const reclaimablePages =
      pageStat('Pages free') +
      pageStat('Pages inactive') +
      pageStat('Pages speculative') +
      pageStat('Pages purgeable')

    const availableBytes = reclaimablePages * pageSize
    if (!Number.isFinite(availableBytes) || availableBytes <= 0) return null
    return Math.min(availableBytes, totalBytes)
  } catch {
    return null
  }
}

function readMemory() {
  const totalBytes = os.totalmem()

  const availableBytes =
    process.platform === 'darwin'
      ? readDarwinAvailableBytes(totalBytes)
      : null

  const freeBytes = availableBytes ?? os.freemem()
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  const usedPercent = totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0

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

        const [caps, cpu] = await Promise.all([ensureGatewayProbed(), readCpu()])
        const status = getConnectionStatus()

        const body: SystemMetricsResponse = {
          checkedAt: Date.now(),
          cpu,
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
