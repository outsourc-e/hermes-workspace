import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchCronJobs,
  fetchCronRuns,
  runCronJob,
  runCronJobIfDue,
  toggleCronJob,
  upsertCronJob,
  deleteCronJob,
} from './cron-api'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchCronJobs', () => {
  it('normalizes mixed job payloads', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        jobs: [
          { id: 'j1', name: 'ops:sage:daily', schedule: '0 9 * * *', enabled: true },
          { jobId: 'j2', title: 'Weekly', cron: '0 0 * * 0', enabled: false },
          { status: 'error', lastRunStatus: 'failed' },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const jobs = await fetchCronJobs()
    expect(jobs).toHaveLength(3)
    expect(jobs[0]).toMatchObject({ id: 'j1', name: 'ops:sage:daily', enabled: true })
    expect(jobs[1]).toMatchObject({ id: 'j2', name: 'Weekly', schedule: '0 0 * * 0' })
    expect(jobs[2].id).toBe('job-2')
    expect(jobs[2].lastRun?.status).toBe('error')
    expect(fetchMock).toHaveBeenCalledWith('/api/hermes-jobs')
  })

  it('returns [] when jobs is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ jobs: null })))
    await expect(fetchCronJobs()).resolves.toEqual([])
  })

  it('throws friendly error for missing croniter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: "require 'croniter' missing" }, 500)),
    )
    await expect(fetchCronJobs()).rejects.toThrow(/Cron support missing/)
  })

  it('throws on ok:false payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'boom' })))
    await expect(fetchCronJobs()).rejects.toThrow('boom')
  })
})

describe('fetchCronRuns', () => {
  it('requests runs action and normalizes statuses', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        runs: [
          { id: 'r1', status: 'completed', startedAt: '2026-10-13T06:00:00Z' },
          { runId: 'r2', state: 'FAILED', error: 'timeout' },
          { status: 'queued' },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const runs = await fetchCronRuns('job 1')
    expect(fetchMock).toHaveBeenCalledWith('/api/hermes-jobs/job%201?action=runs&limit=20')
    expect(runs.map((r) => r.status)).toEqual(['success', 'error', 'queued'])
    expect(runs[1].error).toBe('timeout')
    expect(runs[2].id).toBe('run-2')
  })
})

describe('mutations', () => {
  it('runCronJob POSTs action=run', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await runCronJob('abc')
    expect(fetchMock).toHaveBeenCalledWith('/api/hermes-jobs/abc?action=run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('runCronJobIfDue POSTs action=run-if-due', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await runCronJobIfDue('abc')
    expect(fetchMock.mock.calls[0][0]).toContain('action=run-if-due')
  })

  it('toggleCronJob PATCHes enabled flag', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, enabled: false }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await toggleCronJob({ jobId: 'j9', enabled: false })
    expect(fetchMock).toHaveBeenCalledWith('/api/hermes-jobs/j9', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    expect(res.enabled).toBe(false)
  })

  it('upsertCronJob POSTs without jobId and PATCHes with jobId', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, jobId: 'n1' }))
    vi.stubGlobal('fetch', fetchMock)
    await upsertCronJob({ name: 'ops:sage:x', schedule: '* * * * *', enabled: true })
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    await upsertCronJob({ jobId: 'j1', name: 'n', schedule: '* * * * *', enabled: false })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/hermes-jobs/j1')
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')
  })

  it('deleteCronJob DELETEs encoded id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await deleteCronJob('a/b')
    expect(fetchMock).toHaveBeenCalledWith('/api/hermes-jobs/a%2Fb', { method: 'DELETE' })
  })
})
