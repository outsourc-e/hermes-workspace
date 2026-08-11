// Data access for the Runs screen.
//
// Two endpoints, two very different contracts:
//   • GET  /api/runtime-runs      — read-only projection, safe on every load.
//   • POST /api/provider-runtimes — talks to provider processes; only ever
//     reached from an explicit user gesture (Refresh, or a run action).
// A page load must never fan out into provider CLIs, so the POST is never
// wired into an effect.

import { useCallback, useEffect, useRef, useState } from 'react'

import {  runsQueryString, runsRequestKey } from './runs-search'
import type {RunsSearch} from './runs-search';
import type { RuntimeRun, RuntimeRunSummary } from '@/server/runtime-run-projection'


export type RunsPageInfo = {
  number: number
  size: number
  total: number
  pages: number
  hasNext: boolean
  hasPrevious: boolean
}

export type RunsInventory = {
  ok: boolean
  runs: Array<RuntimeRun>
  selectedRun: RuntimeRun | null
  summary: RuntimeRunSummary
  page: RunsPageInfo
  inventory: { projected: number; matched: number; truncated: boolean }
  availableRoutes: Array<{ id: string; account: string; model: string; status: string }>
  generatedAt: number
}

export type RunsStatus = 'loading' | 'reloading' | 'ready' | 'error' | 'unavailable'

const INVENTORY_ERROR = 'Run inventory is unavailable'
const REFRESH_ERROR = 'Provider discovery failed'

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function errorOf(body: Record<string, unknown> | null, fallback: string): string {
  return typeof body?.error === 'string' && body.error ? body.error : fallback
}

export type UseRunsInventory = {
  status: RunsStatus
  data: RunsInventory | null
  error: string | null
  /** Failure of the last explicit provider discovery, kept apart from load errors. */
  discoveryError: string | null
  discovering: boolean
  /** Re-reads metadata with the current filters. No provider contact. */
  reload: () => Promise<void>
  /** Explicit provider discovery, then a metadata re-read with the same filters. */
  discover: () => Promise<void>
  /** Posts one lifecycle action to the control plane, then re-reads metadata. */
  dispatch: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error: string | null }>
}

export function useRunsInventory(search: RunsSearch, enabled: boolean): UseRunsInventory {
  const [data, setData] = useState<RunsInventory | null>(null)
  const [status, setStatus] = useState<RunsStatus>(enabled ? 'loading' : 'unavailable')
  const [error, setError] = useState<string | null>(null)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [discovering, setDiscovering] = useState(false)

  // Latest values without widening effect dependencies: the load effect must
  // fire on filter identity only, never on unrelated re-renders.
  const searchRef = useRef(search)
  searchRef.current = search
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const requestRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const reload = useCallback(async () => {
    if (!enabledRef.current) return
    const id = ++requestRef.current
    setStatus((previous) => (previous === 'ready' ? 'reloading' : 'loading'))
    setError(null)
    try {
      const query = runsQueryString(searchRef.current, Date.now())
      const response = await fetch(`/api/runtime-runs?${query}`, { headers: { accept: 'application/json' } })
      const body = await readJson(response)
      if (!response.ok || body?.ok !== true) throw new Error(errorOf(body, INVENTORY_ERROR))
      if (id !== requestRef.current || !mountedRef.current) return
      setData(body as unknown as RunsInventory)
      setStatus('ready')
    } catch (reason) {
      if (id !== requestRef.current || !mountedRef.current) return
      setError(messageOf(reason, INVENTORY_ERROR))
      setStatus('error')
    }
  }, [])

  const key = runsRequestKey(search)
  useEffect(() => {
    if (!enabled) {
      requestRef.current += 1
      setStatus('unavailable')
      setData(null)
      setError(null)
      return
    }
    void reload()
  }, [key, enabled, reload])

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/provider-runtimes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await readJson(response)
    if (!response.ok || body?.ok === false) {
      const nested = (body?.result as { error?: unknown } | undefined)?.error
      throw new Error(typeof nested === 'string' && nested ? nested : errorOf(body, REFRESH_ERROR))
    }
  }, [])

  const discover = useCallback(async () => {
    setDiscovering(true)
    setDiscoveryError(null)
    try {
      await post({ action: 'refresh' })
    } catch (reason) {
      if (mountedRef.current) setDiscoveryError(messageOf(reason, REFRESH_ERROR))
    } finally {
      // Metadata is re-read either way: a partial discovery still moves rows.
      await reload()
      if (mountedRef.current) setDiscovering(false)
    }
  }, [post, reload])

  const dispatch = useCallback(async (payload: Record<string, unknown>) => {
    try {
      await post(payload)
      await reload()
      return { ok: true, error: null }
    } catch (reason) {
      await reload()
      return { ok: false, error: messageOf(reason, 'Runtime action was rejected') }
    }
  }, [post, reload])

  return { status, data, error, discoveryError, discovering, reload, discover, dispatch }
}
