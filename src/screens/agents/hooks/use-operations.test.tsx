import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useOperations } from './use-operations'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockBackend(opts?: {
  profiles?: Array<{ name: string; model?: string; path?: string }>
  sessions?: Array<Record<string, unknown>>
  jobs?: Array<Record<string, unknown>>
}) {
  return vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('/api/profiles/list')) {
      return jsonResponse({
        profiles: opts?.profiles ?? [
          { name: 'default', model: 'ternary-bonsai-2-27b:q2_0', path: '/tmp/ws' },
          { name: 'sage', model: 'ternary-bonsai-2-27b:q2_0', path: '/tmp/sage' },
          { name: 'main', model: 'x', path: '/tmp/main' },
          { name: 'pc1-coder', model: 'y', path: '/tmp/pc1' },
        ],
      })
    }
    if (url.includes('/api/sessions')) {
      return jsonResponse({ sessions: opts?.sessions ?? [] })
    }
    if (url.includes('/api/hermes-jobs')) {
      return jsonResponse({ jobs: opts?.jobs ?? [] })
    }
    return jsonResponse({}, 404)
  })
}

function setup(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useOperations(), { wrapper })
}

beforeEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('useOperations agent roster', () => {
  it('hides system agents and renames default to Workspace', async () => {
    const { result } = setup(mockBackend())
    await waitFor(() => expect(result.current.configQuery.isSuccess).toBe(true))
    const ids = result.current.agents.map((a) => a.id)
    expect(ids).toContain('sage')
    expect(ids).not.toContain('main')
    expect(ids).not.toContain('pc1-coder')
    expect(result.current.agents.find((a) => a.id === 'default')?.name).toBe('Workspace')
  })

  it('binds cron jobs by ops:<agentId>: prefix only', async () => {
    const { result } = setup(
      mockBackend({
        jobs: [
          { id: 'j1', name: 'ops:sage:daily', schedule: '* * * * *', enabled: true },
          { id: 'j2', name: 'ops:builder:x', schedule: '* * * * *', enabled: true },
          { id: 'j3', name: 'sage-manual', schedule: '* * * * *', enabled: true },
        ],
      }),
    )
    await waitFor(() => expect(result.current.cronJobsQuery.isSuccess).toBe(true))
    const sage = result.current.agents.find((a) => a.id === 'sage')
    expect(sage?.jobs.map((j) => j.id)).toEqual(['j1'])
  })

  it('matches sessions by key/label substring, newest first', async () => {
    const { result } = setup(
      mockBackend({
        sessions: [
          { key: 'agent:main:ops-sage', label: 'sage old', updatedAt: '2026-10-13T05:00:00Z' },
          { key: 'agent:main:ops-sage', label: 'sage new', updatedAt: '2026-10-13T06:00:00Z' },
          { key: 'other', label: 'unrelated' },
        ],
      }),
    )
    await waitFor(() => expect(result.current.sessionsQuery.isSuccess).toBe(true))
    const sage = result.current.agents.find((a) => a.id === 'sage')
    expect(sage?.sessions).toHaveLength(2)
    expect(sage?.latestSession).toMatchObject({ label: 'sage new' })
  })

  it('marks failing recent sessions as error status', async () => {
    const now = new Date().toISOString()
    const { result } = setup(
      mockBackend({
        sessions: [{ key: 'x-sage-y', label: 's', status: 'failed', updatedAt: now }],
      }),
    )
    await waitFor(() => expect(result.current.sessionsQuery.isSuccess).toBe(true))
    expect(result.current.agents.find((a) => a.id === 'sage')?.status).toBe('error')
  })

  it('marks fresh sessions active and stale ones idle', async () => {
    const fresh = setup(
      mockBackend({
        sessions: [
          { key: 's-sage', label: 's', status: 'running', updatedAt: new Date().toISOString() },
        ],
      }),
    )
    await waitFor(() => expect(fresh.result.current.sessionsQuery.isSuccess).toBe(true))
    expect(fresh.result.current.agents.find((a) => a.id === 'sage')?.status).toBe('active')
    fresh.unmount()

    const stale = setup(
      mockBackend({
        sessions: [{ key: 's-sage', label: 's', status: 'running', updatedAt: '2020-01-01T00:00:00Z' }],
      }),
    )
    await waitFor(() => expect(stale.result.current.sessionsQuery.isSuccess).toBe(true))
    expect(stale.result.current.agents.find((a) => a.id === 'sage')?.status).toBe('idle')
    stale.unmount()
  })

  it('exposes the canonical operations session key per agent', async () => {
    const { result } = setup(mockBackend())
    await waitFor(() => expect(result.current.configQuery.isSuccess).toBe(true))
    expect(result.current.agents.find((a) => a.id === 'sage')?.sessionKey).toBe(
      'agent:main:ops-sage',
    )
  })
})
