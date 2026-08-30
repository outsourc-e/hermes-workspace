import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dashboardFetchMock } = vi.hoisted(() => ({
  dashboardFetchMock: vi.fn(),
}))

vi.mock('./gateway-capabilities', () => ({
  CLAUDE_DASHBOARD_URL: 'http://127.0.0.1:9119',
  dashboardFetch: dashboardFetchMock,
}))

import { updateSession } from './claude-dashboard-api'

beforeEach(() => {
  dashboardFetchMock.mockReset()
})

describe('dashboard session pin updates', () => {
  it('PATCHes the durable pinned field to the Hermes dashboard API', async () => {
    dashboardFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, pinned: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(updateSession('session-1', { pinned: true })).resolves.toMatchObject({
      ok: true,
      pinned: true,
    })
    expect(dashboardFetchMock).toHaveBeenCalledWith('/api/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: true }),
    })
  })
})
