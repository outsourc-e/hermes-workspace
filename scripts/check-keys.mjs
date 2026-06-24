#!/usr/bin/env node
// check-keys.mjs — API key "doctor" for Hermes Workspace.
//
// Reads provider keys from the environment (and the local .env, which is
// gitignored and never committed), then pings each provider's live endpoint
// and reports whether the credential is accepted. Secret values are masked in
// all output — only a short prefix/suffix fingerprint is ever printed.
//
//   node scripts/check-keys.mjs          # diagnostic, always exits 0
//   node scripts/check-keys.mjs --strict # exit 1 if any present key is invalid
//   node scripts/check-keys.mjs --json   # machine-readable summary
//
// "BLOCKED" means the host was refused by an outbound network policy
// (e.g. a proxy CONNECT 403), not that the key is bad — re-run from a host
// that is allowed to reach the provider.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const STRICT = process.argv.includes('--strict')
const JSON_OUT = process.argv.includes('--json')

// ── Minimal .env loader (no dependency; does not overwrite real env) ─────────
function loadDotenv(file) {
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}
loadDotenv(path.join(process.cwd(), '.env'))

function mask(v) {
  if (!v) return '—'
  if (v.length <= 12) return `${v.slice(0, 2)}…(${v.length})`
  return `${v.slice(0, 6)}…${v.slice(-4)} (${v.length})`
}

// status: ok | invalid | missing | blocked | error
async function ping({ url, method = 'GET', headers = {}, body }) {
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(25_000),
    })
    return { code: res.status, ok: res.ok }
  } catch (e) {
    const msg = String(e?.message || e)
    // Outbound policy / proxy CONNECT denials and DNS refusals.
    if (/403|CONNECT|ENOTFOUND|ECONNREFUSED|tunnel|proxy/i.test(msg)) {
      return { blocked: true, detail: msg }
    }
    return { error: true, detail: msg }
  }
}

function classify(envName, res) {
  if (res.blocked) return { status: 'blocked', note: 'network policy denied host' }
  if (res.error) return { status: 'error', note: res.detail }
  // Providers signal a bad credential with 401. A 403 is usually a proxy
  // CONNECT denial, region block, or permission scope — not "wrong key" — so
  // surface it as blocked rather than failing the credential outright.
  if (res.code === 401) return { status: 'invalid', note: 'HTTP 401 — rejected' }
  if (res.code === 403)
    return { status: 'blocked', note: 'HTTP 403 — proxy/region/permission' }
  if (res.ok) return { status: 'ok', note: `HTTP ${res.code}` }
  return { status: 'error', note: `HTTP ${res.code}` }
}

// ── Provider checks ──────────────────────────────────────────────────────────
// Each consumes one env var and hits a cheap, side-effect-free endpoint.
const CHECKS = [
  {
    env: 'ANTHROPIC_API_KEY',
    label: 'Anthropic',
    consumer: 'hermes-agent gateway',
    run: (k) =>
      ping({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': k,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      }),
  },
  {
    env: 'OPENAI_API_KEY',
    label: 'OpenAI',
    consumer: 'workspace provider-usage + hermes-agent',
    run: (k) =>
      ping({
        url: 'https://api.openai.com/v1/models',
        headers: { Authorization: `Bearer ${k}` },
      }),
  },
  {
    env: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    consumer: 'workspace provider-usage',
    run: (k) =>
      ping({
        url: 'https://openrouter.ai/api/v1/key',
        headers: { Authorization: `Bearer ${k}` },
      }),
  },
  {
    env: 'NOUS_API_KEY',
    label: 'Nous',
    consumer: 'hermes-agent gateway',
    run: (k) =>
      ping({
        url: 'https://inference-api.nousresearch.com/v1/models',
        headers: { Authorization: `Bearer ${k}` },
      }),
  },
  {
    env: 'GOOGLE_API_KEY',
    label: 'Google Gemini',
    consumer: 'workspace provider-usage',
    run: (k) =>
      ping({
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
      }),
  },
  {
    env: 'GITHUB_TOKEN',
    label: 'GitHub PAT',
    consumer: 'operator tooling',
    run: (k) =>
      ping({
        url: 'https://api.github.com/user',
        headers: { Authorization: `Bearer ${k}`, 'User-Agent': 'hermes-key-doctor' },
      }),
  },
]

const ICON = { ok: '✅', invalid: '❌', missing: '⚪', blocked: '🚧', error: '⚠️' }

const results = []
for (const c of CHECKS) {
  const key = process.env[c.env]?.trim()
  if (!key) {
    results.push({ ...c, present: false, status: 'missing', note: 'not set' })
    continue
  }
  const res = await c.run(key)
  const { status, note } = classify(c.env, res)
  results.push({ ...c, present: true, masked: mask(key), status, note })
}

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      results.map(({ env, label, present, status, note, consumer }) => ({
        env,
        label,
        present,
        status,
        note,
        consumer,
      })),
      null,
      2,
    ),
  )
} else {
  console.log('\nHermes Workspace — API key doctor\n')
  for (const r of results) {
    const line = [
      ICON[r.status] ?? '·',
      r.label.padEnd(15),
      r.env.padEnd(20),
      r.present ? (r.masked ?? '').padEnd(20) : '—'.padEnd(20),
      r.status.toUpperCase().padEnd(8),
      r.note,
    ].join(' ')
    console.log('  ' + line)
  }
  console.log(
    '\n  Legend: ✅ live  ❌ rejected  ⚪ not set  🚧 blocked by network policy  ⚠️ error',
  )
  console.log('  Consumers:')
  for (const r of results) console.log(`    ${r.env} → ${r.consumer}`)
  console.log()
}

const invalid = results.filter((r) => r.status === 'invalid')
if (STRICT && invalid.length > 0) {
  console.error(`Strict mode: ${invalid.length} present key(s) were rejected.`)
  process.exit(1)
}
process.exit(0)
