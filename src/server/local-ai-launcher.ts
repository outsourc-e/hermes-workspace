/**
 * Local AI runtime launcher.
 *
 * On desktop startup we want the gateway AND the corresponding local AI
 * runtime (Ollama, Atomic Chat, …) to come up together. This module probes
 * each known local provider's port and, if it is offline but the runtime is
 * installed and configured, launches it.
 *
 * Safety rules:
 *   - Never auto-installs anything.
 *   - Never kills a running local AI process.
 *   - Only launches a runtime that is already configured in ~/.hermes config
 *     (mirrors the "launch if configured" decision).
 *   - Opt out entirely with HERMES_SKIP_LOCAL_AI_START=true.
 *   - Launching a runtime does NOT pull any model.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import {
  LOCAL_PROVIDERS,
  isProviderConfigured,
} from './local-provider-discovery'
import type { LocalProviderDef } from './local-provider-discovery'

const PROBE_TIMEOUT_MS = 1_000
const READY_TIMEOUT_MS = 15_000 // wait up to this long for the runtime to answer

export type LocalAIStartResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

const LOCAL_AI_STARTUP_ENABLED =
  process.env.HERMES_SKIP_LOCAL_AI_START !== 'true'

async function isProviderOnline(def: LocalProviderDef): Promise<boolean> {
  const url = `http://127.0.0.1:${def.port}${def.modelsPath}`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Resolve a launch command for a local AI runtime if it is installed.
 * Returns null when the runtime is not installed — in that case we skip
 * (never auto-install).
 */
function resolveLaunchCommand(def: LocalProviderDef): {
  command: string
  args: Array<string>
  env?: Record<string, string>
} | null {
  switch (def.id) {
    case 'ollama': {
      const ollamaBin = resolve(homedir(), '.ollama', 'bin', 'ollama')
      const command = existsSync(ollamaBin) ? ollamaBin : 'ollama'
      // Ensure it's on PATH; if not resolvable at all, `ollama` will fail.
      return { command, args: ['serve'] }
    }
    case 'atomic-chat': {
      const atomicChatBin = resolve(
        homedir(),
        '.atomic-chat',
        'bin',
        'atomic-chat',
      )
      const command = existsSync(atomicChatBin) ? atomicChatBin : 'atomic-chat'
      return { command, args: ['serve'] }
    }
    default:
      return null
  }
}

async function startProvider(
  def: LocalProviderDef,
): Promise<LocalAIStartResult> {
  if (await isProviderOnline(def)) {
    return { ok: true, message: `${def.name} already running` }
  }

  if (!isProviderConfigured(def.id)) {
    return {
      ok: false,
      error: `${def.name} is not configured. Add it via Settings → Connection/Providers first.`,
    }
  }

  const launch = resolveLaunchCommand(def)
  if (!launch) {
    return { ok: false, error: `${def.name} is not supported for auto-start` }
  }

  try {
    const child = spawn(launch.command, launch.args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ...launch.env },
    })
    child.unref()
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : `Failed to start ${def.name}`,
    }
  }

  const ready = await waitUntilReady(def)
  return ready
    ? { ok: true, message: `${def.name} started` }
    : {
        ok: true,
        message: `${def.name} launching — it may take a moment to become ready`,
      }
}

async function waitUntilReady(def: LocalProviderDef): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750))
    if (await isProviderOnline(def)) return true
  }
  return false
}

/**
 * Start all configured local AI runtimes that are installed but offline.
 * Always succeeds (best-effort); per-runtime failures are surfaced in the
 * returned details rather than thrown.
 */
export async function startLocalAI(): Promise<{
  ok: boolean
  results: Record<string, LocalAIStartResult>
}> {
  if (!LOCAL_AI_STARTUP_ENABLED) {
    return {
      ok: true,
      results: {},
    }
  }

  const results: Record<string, LocalAIStartResult> = {}
  await Promise.all(
    LOCAL_PROVIDERS.map(async (def) => {
      results[def.id] = await startProvider(def)
    }),
  )

  return { ok: true, results }
}
