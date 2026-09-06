import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'

const execFileP = promisify(execFile)
const BRIEF_JOB_ID = process.env.HERMES_BRIEF_JOB_ID || 'efe4f56a22ea'
let lastRegen = 0

export async function regenBriefHandler(): Promise<Response> {
  if (Date.now() - lastRegen < 5 * 60_000) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'rate-limited (5 min cooldown)' }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
  lastRegen = Date.now()
  try {
    await execFileP('hermes', ['cron', 'run', BRIEF_JOB_ID])
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const Route = createFileRoute('/api/hud/regen-brief')({
  server: { handlers: { POST: regenBriefHandler } },
})
