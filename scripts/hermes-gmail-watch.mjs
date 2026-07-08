#!/usr/bin/env node
/**
 * Gmail watcher — inbox triage signal for the swarm.
 *
 * Called by the lifecycle sweep. Refreshes the access token from
 * ~/.hermes/google-token.json, lists unread INBOX messages, dedupes via
 * ~/.hermes/logs/gmail-watch-state.json, then:
 *   - all new unread            → Discord home channel (subject + sender)
 *   - IMPORTANT (Gmail's own importance marker or starred) → phone push
 *
 * Read-only in effect (no label writes yet). Disable: HERMES_GMAIL_WATCH=0.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

const envFile = readFileSync(join(homedir(), '.hermes', '.env'), 'utf8')
const get = (name) =>
  envFile
    .split('\n')
    .find((l) => l.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .replace(/^["']|["']$/g, '')
    .trim() ?? ''

if (get('HERMES_GMAIL_WATCH') === '0') process.exit(0)

const TOKEN_PATH = join(homedir(), '.hermes', 'google-token.json')
const STATE_PATH = join(homedir(), '.hermes', 'logs', 'gmail-watch-state.json')
if (!existsSync(TOKEN_PATH)) process.exit(0)

async function accessToken() {
  const saved = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: get('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: get('GOOGLE_OAUTH_CLIENT_SECRET'),
      refresh_token: saved.refresh_token,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('token refresh failed')
  return json.access_token
}

async function gmail(token, path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  return res.json()
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return { seen: [] }
  }
}

function notifyDiscord(content) {
  const token = get('DISCORD_BOT_TOKEN')
  const channel = get('DISCORD_HOME_CHANNEL')
  if (!token || !channel) return Promise.resolve()
  return fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 1900) }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {})
}

function notifyPhone(title, message) {
  const topic = get('HERMES_NTFY_TOPIC')
  if (!topic) return Promise.resolve()
  const server = get('HERMES_NTFY_SERVER') || 'https://ntfy.sh'
  return fetch(`${server.replace(/\/$/, '')}/${topic}`, {
    method: 'POST',
    headers: { Title: title.slice(0, 120), Priority: '4', Tags: 'email' },
    body: message.slice(0, 3800),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {})
}

const token = await accessToken()
const list = await gmail(token, 'messages?q=in:inbox+is:unread&maxResults=20')
const ids = (list.messages ?? []).map((m) => m.id)
const state = loadState()
const seen = new Set(state.seen)
const fresh = ids.filter((id) => !seen.has(id))

if (fresh.length) {
  const details = []
  for (const id of fresh.slice(0, 10)) {
    const msg = await gmail(
      token,
      `messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
    )
    const header = (name) =>
      (msg.payload?.headers ?? []).find((h) => h.name === name)?.value ?? ''
    details.push({
      id,
      subject: header('Subject').slice(0, 150),
      from: header('From').slice(0, 100),
      important:
        (msg.labelIds ?? []).includes('IMPORTANT') ||
        (msg.labelIds ?? []).includes('STARRED'),
    })
  }
  const lines = details.map(
    (d) => `• ${d.important ? '⭐ ' : ''}${d.from} — ${d.subject}`,
  )
  await notifyDiscord(`📧 **Gmail** — ${fresh.length} new unread:\n${lines.join('\n')}`)
  const important = details.filter((d) => d.important)
  if (important.length) {
    await notifyPhone(
      `Important mail (${important.length})`,
      important.map((d) => `${d.from} — ${d.subject}`).join('\n'),
    )
  }
}

mkdirSync(dirname(STATE_PATH), { recursive: true })
writeFileSync(STATE_PATH, JSON.stringify({ seen: ids.slice(0, 200) }))
