import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type NetworkUrlSource = 'tailscale' | 'lan' | 'localhost'

export type NetworkUrlResult = {
  url: string
  source: NetworkUrlSource
  hostname: string | null
}

const TAILSCALE_CGNAT = /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

export function parsePort(raw: string | null | undefined, fallback = 3000): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback
  return n
}

export function isTailscaleIpv4(ip: string | null | undefined): boolean {
  return Boolean(ip && TAILSCALE_CGNAT.test(ip.trim()))
}

export function resolveNetworkUrl({
  port,
  tailscaleIpv4,
  tailscaleHostname,
  lanIpv4,
}: {
  port: number
  tailscaleIpv4?: string | null
  tailscaleHostname?: string | null
  lanIpv4?: string | null
}): NetworkUrlResult {
  const safePort = parsePort(String(port), 3000)
  const host = tailscaleHostname?.replace(/\.$/, '').trim() || null

  if (isTailscaleIpv4(tailscaleIpv4)) {
    const hostname = host || tailscaleIpv4!
    return {
      url: `http://${hostname}:${safePort}`,
      source: 'tailscale',
      hostname: host,
    }
  }

  if (lanIpv4 && lanIpv4 !== '127.0.0.1') {
    return {
      url: `http://${lanIpv4}:${safePort}`,
      source: 'lan',
      hostname: null,
    }
  }

  return {
    url: `http://127.0.0.1:${safePort}`,
    source: 'localhost',
    hostname: null,
  }
}

export function firstLanIpv4(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string | null {
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (isTailscaleIpv4(entry.address)) continue
      return entry.address
    }
  }
  return null
}

export async function readTailscaleIpv4(
  exec = execFileAsync,
): Promise<string | null> {
  try {
    const { stdout } = await exec('tailscale', ['ip', '-4'], { timeout: 2500 })
    const ip = stdout.trim().split(/\s+/)[0]
    return isTailscaleIpv4(ip) ? ip : null
  } catch {
    return null
  }
}

export async function readTailscaleHostname(
  exec = execFileAsync,
): Promise<string | null> {
  try {
    const { stdout } = await exec('tailscale', ['status', '--json'], {
      timeout: 2500,
    })
    const parsed = JSON.parse(stdout) as {
      Self?: { DNSName?: string }
    }
    const name = parsed.Self?.DNSName?.replace(/\.$/, '').trim()
    return name || null
  } catch {
    return null
  }
}

export async function detectNetworkUrl(port: number): Promise<NetworkUrlResult> {
  const [tailscaleIpv4, tailscaleHostname] = await Promise.all([
    readTailscaleIpv4(),
    readTailscaleHostname(),
  ])
  return resolveNetworkUrl({
    port,
    tailscaleIpv4,
    tailscaleHostname,
    lanIpv4: firstLanIpv4(os.networkInterfaces()),
  })
}
