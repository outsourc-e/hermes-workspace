/**
 * Auto-verification: trust but verify, automatically.
 *
 * Every non-trivial DONE checkpoint gets an adversarial verification task
 * queued for the reviewer. The reviewer re-checks the claimed evidence
 * (files changed, commands run) and must end its RESULT with either
 * "VERDICT: CONFIRMED" or "VERDICT: REFUTED — <why>". A refuted verdict
 * triggers a Discord alert so bad work never silently lands.
 *
 * Loop safety: verification tasks are tagged with the VERIFY_PREFIX and are
 * never themselves verified; reviewer/qa output is exempt too.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { notifyPhone } from './notify'
import { baseOf } from './swarm-fleet'
import { enqueueTask, listQueue } from './swarm-queue'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

export const VERIFY_PREFIX = '[verify]'
const VERIFIER = 'reviewer'
const EXEMPT_WORKERS = new Set([VERIFIER, 'qa'])
const MIN_TASK_CHARS = 120

export function isVerificationTask(task: string): boolean {
  return task.trimStart().startsWith(VERIFY_PREFIX)
}

export function shouldVerify(input: {
  workerId: string
  task: string
  ok: boolean
  checkpoint: ParsedSwarmCheckpoint | null | undefined
}): boolean {
  if (process.env.HERMES_SWARM_AUTO_VERIFY === '0') return false
  if (!input.ok) return false
  if (!input.checkpoint || input.checkpoint.stateLabel !== 'DONE') return false
  if (isVerificationTask(input.task)) return false
  if (EXEMPT_WORKERS.has(baseOf(input.workerId))) return false
  if (input.task.trim().length < MIN_TASK_CHARS) return false
  return true
}

/** Queue an adversarial verification of a DONE checkpoint. Best-effort. */
export function enqueueVerification(input: {
  workerId: string
  task: string
  checkpoint: ParsedSwarmCheckpoint
}): boolean {
  try {
    const fingerprint = `verify:${input.workerId}:${input.task.slice(0, 80)}`
    // Don't stack duplicate verifications for the same claim.
    const open = listQueue().some(
      (i) =>
        (i.status === 'queued' ||
          i.status === 'proposed' ||
          i.status === 'dispatched') &&
        i.note === fingerprint,
    )
    if (open) return false
    const cp = input.checkpoint
    enqueueTask({
      task: [
        `${VERIFY_PREFIX} Adversarially verify a completed task. Worker "${input.workerId}" claims DONE for:`,
        '',
        input.task.slice(0, 1200),
        '',
        `Claimed result: ${(cp.result ?? '').slice(0, 600) || '(none)'}`,
        `Claimed files changed: ${(cp.filesChanged ?? 'none').slice(0, 400)}`,
        `Claimed commands run: ${(cp.commandsRun ?? 'none').slice(0, 400)}`,
        '',
        'Your job: try to REFUTE the claim. Check that the claimed files actually',
        'changed and contain what the result says; re-run the cheapest command',
        'that would expose a lie (a failing test, a missing file, a 500).',
        'Do NOT fix anything. End your checkpoint RESULT with exactly one of:',
        '"VERDICT: CONFIRMED" or "VERDICT: REFUTED — <one-line reason>".',
      ].join('\n'),
      worker: VERIFIER,
      priority: 1,
      note: fingerprint,
    })
    return true
  } catch {
    return false
  }
}

/** Parse a verification checkpoint for a refuted verdict. */
export function refutedVerdict(
  checkpoint: ParsedSwarmCheckpoint | null | undefined,
): string | null {
  const text = checkpoint?.result ?? ''
  const match = /VERDICT:\s*REFUTED\s*[—-]?\s*(.*)/i.exec(text)
  return match ? match[1].trim().slice(0, 300) || 'no reason given' : null
}

/**
 * Discord alert straight from the server (same env file the scripts use).
 * Fire-and-forget; never throws.
 */
export function notifyDiscord(content: string): void {
  try {
    const envFile = readFileSync(join(homedir(), '.hermes', '.env'), 'utf8')
    const get = (name: string) =>
      envFile
        .split('\n')
        .find((l) => l.startsWith(`${name}=`))
        ?.slice(name.length + 1)
        .replace(/^["']|["']$/g, '')
        .trim() ?? ''
    const token = get('DISCORD_BOT_TOKEN')
    const channel = get('DISCORD_HOME_CHANNEL') || get('DISCORD_DIGEST_CHANNEL')
    if (!token || !channel) return
    void fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {})
  } catch {
    /* best-effort */
  }
}

/**
 * Hook called from finalizeDispatch for every completed dispatch:
 *  - queues verification for fresh DONE work
 *  - alerts on refuted verdicts coming back from the verifier
 */
export function processVerification(input: {
  workerId: string
  task: string
  ok: boolean
  checkpoint: ParsedSwarmCheckpoint | null | undefined
}): void {
  try {
    if (isVerificationTask(input.task) && input.checkpoint) {
      const refuted = refutedVerdict(input.checkpoint)
      if (refuted) {
        notifyDiscord(
          `🚨 **Verification FAILED** — reviewer refuted a DONE claim:\n${refuted}\n> ${input.task.split('\n')[2]?.slice(0, 150) ?? ''}`,
        )
        notifyPhone({
          title: 'Verification FAILED',
          message: refuted,
          priority: 5,
          tags: ['rotating_light'],
        })
      }
      return
    }
    if (shouldVerify(input) && input.checkpoint) {
      enqueueVerification({
        workerId: input.workerId,
        task: input.task,
        checkpoint: input.checkpoint,
      })
    }
  } catch {
    /* never break dispatch */
  }
}
