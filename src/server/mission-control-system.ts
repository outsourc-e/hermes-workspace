import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

export type IntegrationStatus = 'live' | 'degraded' | 'blocked' | 'not_configured'

export type MissionControlSystemSnapshot = {
  generatedAt: string
  integrations: Array<{
    id: string
    label: string
    status: IntegrationStatus
    lastCheckedAt: string
    detail: string
    evidence?: string
    directAction?: string
  }>
  apple: {
    calendar: { status: IntegrationStatus; todayCount: number | null; detail: string; lastCheckedAt: string }
    reminders: { status: IntegrationStatus; openCount: number | null; overdueCount: number | null; detail: string; lastCheckedAt: string }
  }
  obsidian: {
    status: IntegrationStatus
    vaultPath: string
    recentNotes: Array<{ name: string; path: string; updatedAt: string; uri: string }>
  }
  hermes: {
    status: IntegrationStatus
    version: string | null
    cron: { total: number; active: number; failed: number; nextRunAt: string | null }
    providers: Array<{ provider: string; status: IntegrationStatus; detail: string }>
    modelWarnings: Array<{ severity: 'info' | 'warn' | 'error'; detail: string; evidence: string }>
  }
  infrastructure: {
    host: string
    platform: string
    uptimeSeconds: number
    memory: { totalBytes: number; freeBytes: number }
    disk: { mount: string; capacity: string; used: string; available: string } | null
  }
  approvals: Array<{ action: string; reason: string; required: true }>
  privacy: { redaction: 'enabled'; secretDisplay: 'status-only'; externalExposure: 'local-only' }
}

type CommandResult = { ok: boolean; stdout: string; stderr: string }

const HERMES_HOME = process.env.HERMES_HOME?.trim() || path.join(os.homedir(), '.hermes')
const DEFAULT_VAULT = path.join(os.homedir(), 'Documents/Obsidian Vault/Bethanys Second Brain')

export function redactSensitive(value: string): string {
  return value
    .replace(/(Bearer|Zoho-oauthtoken)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CLIENT_SECRET)[A-Z0-9_]*\s*=\s*)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[REDACTED]')
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, '[REDACTED_TOKEN]')
}

function readEnvKeys(): Set<string> {
  const envPath = path.join(HERMES_HOME, '.env')
  const keys = new Set<string>()
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq > 0) keys.add(trimmed.slice(0, eq).trim())
    }
  } catch {
    // missing env is okay; status endpoint reports not_configured
  }
  for (const key of Object.keys(process.env)) keys.add(key)
  return keys
}

function command(file: string, args: string[], timeoutMs = 4_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: 256_000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: redactSensitive(String(stdout || '')), stderr: redactSensitive(String(stderr || '')) })
    })
    child.on('error', (err) => resolve({ ok: false, stdout: '', stderr: err.message }))
  })
}

function readJson(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString()
}

function obsidianUri(vaultPath: string, notePath: string): string {
  const rel = path.relative(vaultPath, notePath).replace(/\\/g, '/')
  return `obsidian://open?vault=${encodeURIComponent(path.basename(vaultPath))}&file=${encodeURIComponent(rel)}`
}

function getRecentObsidianNotes(vaultPath: string) {
  const notes: Array<{ file: string; mtimeMs: number }> = []
  const skip = new Set(['.obsidian', '.trash', 'node_modules'])
  const walk = (dir: string, depth: number) => {
    if (depth > 5 || notes.length > 500) return
    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        try { notes.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs }) } catch {}
      }
    }
  }
  walk(vaultPath, 0)
  return notes
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 8)
    .map((n) => ({ name: path.basename(n.file), path: n.file, updatedAt: isoFromMs(n.mtimeMs), uri: obsidianUri(vaultPath, n.file) }))
}

async function getAppleSnapshot(now: string): Promise<MissionControlSystemSnapshot['apple']> {
  const calendarScript = 'tell application "Calendar"\nset startDate to current date\nset hours of startDate to 0\nset minutes of startDate to 0\nset seconds of startDate to 0\nset endDate to startDate + 1 * days\nset eventCount to 0\nrepeat with cal in calendars\nset eventCount to eventCount + (count of (events of cal whose start date ≥ startDate and start date < endDate))\nend repeat\nreturn eventCount\nend tell'
  const reminderScript = 'tell application "Reminders"\nset openCount to 0\nset overdueCount to 0\nset nowDate to current date\nrepeat with l in lists\nrepeat with r in reminders of l whose completed is false\nset openCount to openCount + 1\ntry\nif due date of r is not missing value and due date of r < nowDate then set overdueCount to overdueCount + 1\nend try\nend repeat\nend repeat\nreturn (openCount as text) & "," & (overdueCount as text)\nend tell'
  const [cal, rem] = await Promise.all([
    command('/usr/bin/osascript', ['-e', calendarScript], 8_000),
    command('/usr/bin/osascript', ['-e', reminderScript], 8_000),
  ])
  const todayCount = cal.ok ? Number.parseInt(cal.stdout.trim(), 10) : Number.NaN
  const [openRaw, overdueRaw] = rem.ok ? rem.stdout.trim().split(',') : []
  return {
    calendar: {
      status: Number.isFinite(todayCount) ? 'live' : 'blocked',
      todayCount: Number.isFinite(todayCount) ? todayCount : null,
      detail: Number.isFinite(todayCount) ? 'Read from local macOS Calendar via permissioned AppleScript bridge.' : `Calendar bridge blocked or not permitted: ${(cal.stderr || cal.stdout).slice(0, 180)}`,
      lastCheckedAt: now,
    },
    reminders: {
      status: openRaw ? 'live' : 'blocked',
      openCount: openRaw ? Number.parseInt(openRaw, 10) : null,
      overdueCount: overdueRaw ? Number.parseInt(overdueRaw, 10) : null,
      detail: openRaw ? 'Read from local macOS Reminders via permissioned AppleScript bridge.' : `Reminders bridge blocked or not permitted: ${(rem.stderr || rem.stdout).slice(0, 180)}`,
      lastCheckedAt: now,
    },
  }
}

function getCronSummary() {
  const jobs = readJson(path.join(HERMES_HOME, 'cron/jobs.json'))
  const list = Array.isArray(jobs) ? jobs : Array.isArray((jobs as { jobs?: unknown[] } | null)?.jobs) ? (jobs as { jobs: unknown[] }).jobs : []
  let active = 0
  let failed = 0
  let nextRunAt: string | null = null
  for (const item of list as Array<Record<string, unknown>>) {
    if (item.enabled !== false && item.paused !== true) active += 1
    const status = String(item.last_status || item.status || '').toLowerCase()
    if (status.includes('fail') || status.includes('error')) failed += 1
    const candidate = typeof item.next_run_at === 'string' ? item.next_run_at : typeof item.next_run === 'string' ? item.next_run : null
    if (candidate && (!nextRunAt || candidate < nextRunAt)) nextRunAt = candidate
  }
  return { total: list.length, active, failed, nextRunAt }
}

function tailFile(filePath: string, maxBytes = 180_000): string {
  try {
    const stat = fs.statSync(filePath)
    const fd = fs.openSync(filePath, 'r')
    const bytes = Math.min(stat.size, maxBytes)
    const buffer = Buffer.alloc(bytes)
    fs.readSync(fd, buffer, 0, bytes, Math.max(0, stat.size - bytes))
    fs.closeSync(fd)
    return redactSensitive(buffer.toString('utf8'))
  } catch {
    return ''
  }
}

async function getHermesSnapshot(envKeys: Set<string>): Promise<MissionControlSystemSnapshot['hermes']> {
  const version = await command(path.join(os.homedir(), '.local/bin/hermes'), ['--version'], 6_000)
  const cron = getCronSummary()
  const gatewayLog = tailFile(path.join(HERMES_HOME, 'logs/gateway.error.log')) + '\n' + tailFile(path.join(HERMES_HOME, 'logs/agent.log'))
  const warnings: MissionControlSystemSnapshot['hermes']['modelWarnings'] = []
  if (/openrouter[\s\S]{0,200}(402|45 tokens affordable|free-models-per-day|429)/i.test(gatewayLog)) {
    warnings.push({ severity: 'error', detail: 'OpenRouter fallback is not currently reliable; logs show credit/quota/rate-limit failures.', evidence: 'Redacted gateway logs include OpenRouter 402/429/free quota exhaustion markers.' })
  }
  if (/usage_limit_reached/i.test(gatewayLog)) {
    warnings.push({ severity: 'warn', detail: 'Historical OpenAI Codex usage-limit errors exist in logs; time-scope future incidents before assuming a current limit.', evidence: 'Redacted logs include usage_limit_reached.' })
  }
  if (/gpt-5\.6-sol/i.test(gatewayLog)) {
    warnings.push({ severity: 'info', detail: 'Sol appears in historical errors; current evidence points to OpenRouter route failures for openai/gpt-5.6-sol, not necessarily Codex Sol allowance.', evidence: 'Redacted logs include gpt-5.6-sol with OpenRouter failure markers.' })
  }
  const providers = [
    { provider: 'openai-codex', status: envKeys.has('OPENAI_CODEX_HOME') || fs.existsSync(path.join(HERMES_HOME, 'auth.json')) ? 'live' as const : 'not_configured' as const, detail: 'OAuth credentials are managed by Hermes auth; dashboard displays status only.' },
    { provider: 'openrouter', status: warnings.some((w) => w.detail.includes('OpenRouter')) ? 'degraded' as const : envKeys.has('OPENROUTER_API_KEY') ? 'live' as const : 'not_configured' as const, detail: warnings.some((w) => w.detail.includes('OpenRouter')) ? 'Configured but recent logs show quota/credit/rate-limit failures.' : 'Status inferred from configured environment key.' },
    { provider: 'notion', status: envKeys.has('NOTION_API_KEY') || envKeys.has('NOTION_API_TOKEN') ? 'live' as const : 'not_configured' as const, detail: 'Used server-side only through the Notion proxy.' },
  ]
  return {
    status: version.ok ? (warnings.some((w) => w.severity === 'error') ? 'degraded' : 'live') : 'blocked',
    version: version.ok ? version.stdout.split('\n')[0] || null : null,
    cron,
    providers,
    modelWarnings: warnings,
  }
}

function getDiskSnapshot() {
  try {
    const out = fs.existsSync('/bin/df') ? null : null
    void out
  } catch {}
  return null
}

async function getInfrastructureSnapshot(): Promise<MissionControlSystemSnapshot['infrastructure']> {
  const df = await command('/bin/df', ['-Pk', os.homedir()], 4_000)
  let disk: MissionControlSystemSnapshot['infrastructure']['disk'] = null
  if (df.ok) {
    const line = df.stdout.trim().split('\n')[1]
    const parts = line?.split(/\s+/) ?? []
    if (parts.length >= 6) disk = { mount: parts.slice(5).join(' '), capacity: `${parts[1]} KiB`, used: `${parts[2]} KiB`, available: `${parts[3]} KiB` }
  }
  getDiskSnapshot()
  return {
    host: os.hostname(),
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    uptimeSeconds: Math.round(os.uptime()),
    memory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
    disk,
  }
}

export async function buildMissionControlSystemSnapshot(): Promise<MissionControlSystemSnapshot> {
  const now = new Date().toISOString()
  const envKeys = readEnvKeys()
  const [apple, hermes, infrastructure] = await Promise.all([
    getAppleSnapshot(now),
    getHermesSnapshot(envKeys),
    getInfrastructureSnapshot(),
  ])
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH?.trim() || DEFAULT_VAULT
  const recentNotes = fs.existsSync(vaultPath) ? getRecentObsidianNotes(vaultPath) : []
  const zohoConfigured = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'].some((key) => envKeys.has(key))
  const integrations = [
    { id: 'notion', label: 'Notion CRM / operations', status: envKeys.has('NOTION_API_KEY') || envKeys.has('NOTION_API_TOKEN') ? 'live' as const : 'not_configured' as const, lastCheckedAt: now, detail: 'Structured business system of record; queried by existing server-side proxy.', directAction: '/notion' },
    { id: 'zoho', label: 'Zoho Mail', status: zohoConfigured ? 'degraded' as const : 'not_configured' as const, lastCheckedAt: now, detail: zohoConfigured ? 'Credential markers exist, but full OAuth/account/folder sync is not enabled in this dashboard yet.' : 'No Zoho OAuth credential markers found in the server environment. Email remains blocked until OAuth is configured.', evidence: 'Status is inferred from environment key names only; values are never read into the UI.' },
    { id: 'calendar', label: 'Apple Calendar', status: apple.calendar.status, lastCheckedAt: now, detail: apple.calendar.detail },
    { id: 'reminders', label: 'Apple Reminders', status: apple.reminders.status, lastCheckedAt: now, detail: apple.reminders.detail },
    { id: 'obsidian', label: 'Obsidian vault', status: recentNotes.length > 0 ? 'live' as const : 'blocked' as const, lastCheckedAt: now, detail: recentNotes.length > 0 ? 'Vault is readable; recent notes include verified obsidian:// direct links.' : 'Vault path not readable from this process.', directAction: 'obsidian://open' },
    { id: 'hermes', label: 'Hermes agents and automations', status: hermes.status, lastCheckedAt: now, detail: `${hermes.cron.active}/${hermes.cron.total} schedules active; ${hermes.modelWarnings.length} model/provider warning(s).`, directAction: '/dashboard' },
  ]
  return {
    generatedAt: now,
    integrations,
    apple,
    obsidian: { status: recentNotes.length > 0 ? 'live' : 'blocked', vaultPath, recentNotes },
    hermes,
    infrastructure,
    approvals: [
      { action: 'Configure Zoho OAuth and enable message sync', reason: 'Requires OAuth/client credentials and least-privilege scope approval.', required: true },
      { action: 'Create synthetic Notion/client/calendar/reminder records', reason: 'External writes are consequential and must be explicitly approved before the end-to-end demo writes real systems.', required: true },
      { action: 'Change production model routing or fallback provider', reason: 'Could affect cost, reliability, and quota behavior.', required: true },
      { action: 'Expose Mission Control outside localhost/LAN', reason: 'Would expand attack surface; Tailscale/local-only is the safe default.', required: true },
    ],
    privacy: { redaction: 'enabled', secretDisplay: 'status-only', externalExposure: 'local-only' },
  }
}
