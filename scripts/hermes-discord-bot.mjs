#!/usr/bin/env node
/**
 * Two-way Discord bot for the Hermes swarm.
 *
 * Polls the home channel over the Discord REST API (no gateway/websocket, no
 * extra dependencies) and executes operator commands against the local
 * workspace API:
 *
 *   !help                          — command list
 *   !status                        — worker/mission/health summary
 *   !blocked                       — blocked assignments with ids
 *   !dispatch <worker> <task…>     — dispatch a task to a worker
 *   !retry <missionId> <assignId>  — unblock+retry a blocked assignment
 *   !dismiss <missionId> <assignId>— dismiss a blocked assignment
 *   !clearblocked                  — clear the whole blocked board
 *
 * Security model:
 *   - Token/channel from ~/.hermes/.env (DISCORD_BOT_TOKEN,
 *     DISCORD_HOME_CHANNEL or DISCORD_DIGEST_CHANNEL). Never printed.
 *   - Mutating commands (!dispatch/!retry/!dismiss/!clearblocked) require
 *     DISCORD_OPERATOR_ID to be set and to match the message author. Without
 *     it the bot is read-only (!status/!blocked/!help).
 *   - Talks only to the local workspace (SWARM_BASE_URL, default :3000)
 *     using the same claude-auth session cookie as the UI.
 *
 * Run under launchd (com.hermes.discord-bot, KeepAlive) — installed by
 * scripts/swarm-install-schedules.sh.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ENV_FILE = process.env.HERMES_ENV_FILE || join(homedir(), '.hermes', '.env')
const BASE_URL = process.env.SWARM_BASE_URL || 'http://localhost:3000'
const SESSIONS_FILE =
  process.env.SWARM_SESSIONS_FILE ||
  join(homedir(), '.hermes', 'workspace-sessions.json')
const POLL_MS = 10_000
const API = 'https://discord.com/api/v10'

function getenv(name) {
  try {
    const line = readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`))
    return line ? line.slice(name.length + 1).replace(/^["']|["']\s*$/g, '').trim() : ''
  } catch {
    return ''
  }
}

const BOT_TOKEN = getenv('DISCORD_BOT_TOKEN')
const CHANNEL =
  process.env.DISCORD_HOME_CHANNEL ||
  getenv('DISCORD_HOME_CHANNEL') ||
  getenv('DISCORD_DIGEST_CHANNEL')
const OPERATOR_ID = process.env.DISCORD_OPERATOR_ID || getenv('DISCORD_OPERATOR_ID')

if (!BOT_TOKEN || !CHANNEL) {
  console.error('[discord-bot] missing DISCORD_BOT_TOKEN or channel — exiting')
  process.exit(1)
}

function workspaceToken() {
  try {
    const data = JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'))
    const now = Date.now()
    for (const [tok, expiry] of Object.entries(data.tokens || {})) {
      if (expiry > now) return tok
    }
  } catch {
    /* fall through */
  }
  return ''
}

async function discord(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}))
    const wait = Math.ceil((body.retry_after || 2) * 1000)
    await new Promise((r) => setTimeout(r, wait))
    return discord(path, options)
  }
  if (!res.ok) throw new Error(`discord ${path} HTTP ${res.status}`)
  return res.json()
}

async function say(content) {
  // Discord hard-caps messages at 2000 chars.
  const text = content.length > 1900 ? `${content.slice(0, 1900)}…` : content
  await discord(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: text }),
  })
}

async function workspace(path, options = {}) {
  const tok = workspaceToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Cookie: `claude-auth=${tok}` } : {}),
      ...(options.headers || {}),
    },
  })
  return res.json().catch(() => ({}))
}

// ---- command handlers -------------------------------------------------------

async function cmdStatus() {
  const [missions, health] = await Promise.all([
    workspace('/api/swarm-missions?limit=10'),
    workspace('/api/swarm-health'),
  ])
  const list = missions.missions || []
  const active = list.filter((m) => ['executing', 'dispatching', 'planning', 'reviewing'].includes(m.state))
  const blocked = list.filter((m) => m.state === 'blocked')
  const warnings = health?.summary?.warnings || []
  const lines = [
    `**Swarm status**`,
    `Missions: ${active.length} active, ${blocked.length} blocked (last ${list.length})`,
  ]
  for (const m of active.slice(0, 5)) {
    lines.push(`• \`${m.id}\` ${m.state} — ${String(m.title || '').slice(0, 80)}`)
  }
  lines.push(warnings.length ? `Health warnings: ${warnings.slice(0, 3).join(' | ').slice(0, 300)}` : 'Health: no warnings')
  await say(lines.join('\n'))
}

async function cmdBlocked() {
  const missions = await workspace('/api/swarm-missions?limit=25')
  const rows = []
  for (const m of missions.missions || []) {
    for (const a of m.assignments || []) {
      if (a.state === 'blocked' || a.state === 'needs_input') {
        rows.push(
          `• \`${m.id}\` / \`${a.id}\` ${a.workerId}: ${String(a.blockedReason || a.task || '').slice(0, 120)}`,
        )
      }
    }
  }
  await say(
    rows.length
      ? `**Blocked assignments** (retry: \`!retry <missionId> <assignmentId>\`)\n${rows.slice(0, 15).join('\n')}`
      : 'Nothing blocked. 🎉',
  )
}

async function cmdDispatch(workerId, task) {
  const res = await workspace('/api/swarm-dispatch', {
    method: 'POST',
    body: JSON.stringify({
      assignments: [{ workerId, task }],
      waitForCheckpoint: false,
      timeoutSeconds: 480,
    }),
  })
  const r = res.results?.[0] || res
  await say(
    r.ok || res.ok
      ? `Dispatched to **${workerId}** ✅ (mission \`${res.missionId || 'n/a'}\`)`
      : `Dispatch to **${workerId}** failed: ${String(r.error || res.error || 'unknown').slice(0, 300)}`,
  )
}

async function cmdUnblock(missionId, assignmentId, resolution) {
  const res = await workspace('/api/swarm-missions', {
    method: 'POST',
    body: JSON.stringify({ action: 'unblock', missionId, assignmentId, resolution }),
  })
  if (!res.ok) return say(`Failed: ${String(res.error || 'unknown').slice(0, 200)}`)
  if (resolution === 'retry' && res.redispatch) {
    await cmdDispatch(res.redispatch.workerId, res.redispatch.task)
  } else {
    await say(`Assignment \`${assignmentId}\` ${resolution === 'retry' ? 'retried' : 'dismissed'} ✅`)
  }
}

async function cmdClearBlocked() {
  const res = await workspace('/api/swarm-missions', {
    method: 'POST',
    body: JSON.stringify({ action: 'clear-blocked' }),
  })
  await say(res.ok ? 'Blocked board cleared ✅' : `Failed: ${String(res.error || '').slice(0, 200)}`)
}

async function cmdQueueAdd(rest) {
  // Optional flags: p1/p2/p3 priority, @worker target. Rest = task text.
  let priority = 2
  let worker = null
  const words = []
  for (const w of rest) {
    if (/^p[123]$/i.test(w)) priority = Number(w.slice(1))
    else if (w.startsWith('@') && w.length > 1) worker = w.slice(1)
    else words.push(w)
  }
  const task = words.join(' ')
  if (!task) return say('Usage: `!queue [p1|p2|p3] [@worker] <task…>`')
  const res = await workspace('/api/swarm-queue', {
    method: 'POST',
    body: JSON.stringify({ task, priority, worker }),
  })
  await say(
    res.ok
      ? `Queued \`${res.item.id}\` (p${res.item.priority}${worker ? `, ${worker}` : ', auto-assign'}) ✅`
      : `Queue failed: ${String(res.error || 'unknown').slice(0, 200)}`,
  )
}

async function cmdQueueList() {
  const res = await workspace('/api/swarm-queue')
  const open = (res.items || []).filter((i) => ['queued', 'dispatched'].includes(i.status))
  if (!open.length) return say('Queue empty. 🎉')
  const rows = open
    .slice(0, 15)
    .map(
      (i) =>
        `• \`${i.id}\` p${i.priority} [${i.status}${i.worker ? ` → ${i.worker}` : ''}] ${i.task.slice(0, 80)}`,
    )
  await say(`**Task queue** (${open.length} open)\n${rows.join('\n')}`)
}

const HELP = [
  '**Hermes swarm bot**',
  '`!status` — missions + health',
  '`!blocked` — blocked assignments',
  '`!queue [p1|p2|p3] [@worker] <task…>` — add to queue (operator only)',
  '`!queuelist` — show queue',
  '`!dispatch <worker> <task…>` — send work (operator only)',
  '`!retry <missionId> <assignmentId>` — retry blocked (operator only)',
  '`!dismiss <missionId> <assignmentId>` — dismiss blocked (operator only)',
  '`!clearblocked` — clear blocked board (operator only)',
].join('\n')

async function handle(msg) {
  const text = (msg.content || '').trim()
  if (!text.startsWith('!')) return
  const [cmd, ...rest] = text.split(/\s+/)
  const isOperator = OPERATOR_ID && msg.author?.id === OPERATOR_ID

  const mutating = ['!dispatch', '!retry', '!dismiss', '!clearblocked', '!queue'].includes(cmd)
  if (mutating && !isOperator) {
    await say(
      OPERATOR_ID
        ? 'Only the configured operator can run that.'
        : 'Mutating commands are disabled: set DISCORD_OPERATOR_ID in ~/.hermes/.env first.',
    )
    return
  }

  try {
    if (cmd === '!help') await say(HELP)
    else if (cmd === '!status') await cmdStatus()
    else if (cmd === '!blocked') await cmdBlocked()
    else if (cmd === '!dispatch') {
      const worker = rest.shift()
      const task = rest.join(' ')
      if (!worker || !task) return say('Usage: `!dispatch <worker> <task…>`')
      await cmdDispatch(worker, task)
    } else if (cmd === '!retry' || cmd === '!dismiss') {
      const [missionId, assignmentId] = rest
      if (!missionId || !assignmentId)
        return say(`Usage: \`${cmd} <missionId> <assignmentId>\``)
      await cmdUnblock(missionId, assignmentId, cmd === '!retry' ? 'retry' : 'dismiss')
    } else if (cmd === '!clearblocked') await cmdClearBlocked()
    else if (cmd === '!queue') await cmdQueueAdd(rest)
    else if (cmd === '!queuelist') await cmdQueueList()
  } catch (err) {
    await say(`Command failed: ${String(err?.message || err).slice(0, 200)}`).catch(() => {})
  }
}

// ---- poll loop ---------------------------------------------------------------

let selfId = ''
let lastId = ''
let channelId = CHANNEL

/**
 * The configured channel id can go stale (channel deleted, bot re-invited).
 * Fall back to the first guild text channel the bot can read — same
 * behavior as hermes-discord-digest.sh.
 */
async function resolveChannel() {
  try {
    await discord(`/channels/${channelId}/messages?limit=1`)
    return
  } catch {
    /* discover below */
  }
  const guilds = await discord('/users/@me/guilds')
  for (const guild of guilds) {
    const channels = await discord(`/guilds/${guild.id}/channels`)
    const text = channels
      .filter((c) => c.type === 0)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    for (const c of text) {
      try {
        await discord(`/channels/${c.id}/messages?limit=1`)
        channelId = c.id
        console.log(`[discord-bot] configured channel unreachable; using #${c.name} (${c.id})`)
        return
      } catch {
        /* try next */
      }
    }
  }
  throw new Error('no reachable text channel found')
}

async function main() {
  const me = await discord('/users/@me')
  selfId = me.id
  await resolveChannel()
  // Start from the latest message so old history isn't replayed.
  const recent = await discord(`/channels/${channelId}/messages?limit=1`)
  lastId = recent[0]?.id || ''
  console.log(`[discord-bot] online as ${me.username}, watching channel ${channelId}`)

  for (;;) {
    try {
      const qs = lastId ? `?after=${lastId}&limit=25` : '?limit=5'
      const messages = await discord(`/channels/${channelId}/messages${qs}`)
      // API returns newest-first; process oldest-first.
      for (const msg of messages.reverse()) {
        lastId = msg.id
        if (msg.author?.id === selfId || msg.author?.bot) continue
        await handle(msg)
      }
    } catch (err) {
      console.error(`[discord-bot] poll error: ${String(err?.message || err)}`)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

main().catch((err) => {
  console.error(`[discord-bot] fatal: ${String(err?.message || err)}`)
  process.exit(1)
})
