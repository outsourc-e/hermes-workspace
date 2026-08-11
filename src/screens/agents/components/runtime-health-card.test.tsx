// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RuntimeHealthCard } from './runtime-health-card'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) =>
    React.createElement('a', { href: to, ...props }, children),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, render, ...props }: {
    children: React.ReactNode
    render?: React.ReactElement
    [key: string]: unknown
  }) => render
    ? React.cloneElement(render, props as React.HTMLAttributes<HTMLElement>, children)
    : React.createElement('button', props, children),
}))

async function renderCard() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => { root.render(<RuntimeHealthCard />) })
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  return { container, unmount: async () => { await React.act(async () => root.unmount()); container.remove() } }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({
    ok: true,
    runs: [],
    summary: {
      total: 20, active: 3, idle: 15, stopped: 1, attention: 1,
      idleResumable: 16, linkedKanban: 18, unlinkedKanban: 2,
      owned: 1, recoverable: 1, unknownOwnership: 1, stale: 4,
      byProvider: { codex: 18, claude: 1, hermes: 1 },
      byState: { active: 3, idle: 15, stopped: 1, attention: 1 },
    },
    page: { number: 1, size: 1, total: 20, pages: 20, hasNext: true, hasPrevious: false },
    generatedAt: 1_000,
  }), { status: 200 }))
  global.fetch = fetchMock as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('RuntimeHealthCard', () => {
  it('renders bounded runtime health and never invokes provider refresh on Operations load', async () => {
    const { container, unmount } = await renderCard()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/runtime-runs')
    expect(fetchMock.mock.calls[0][1]?.method).not.toBe('POST')
    expect(container.textContent).toContain('Runtime health')
    expect(container.textContent).toContain('3 active')
    expect(container.textContent).toContain('16 resumable')
    expect(container.textContent).toContain('1 need attention')
    expect(container.textContent).toContain('2 unlinked')
    expect(container.textContent).toContain('1 recoverable')
    expect(container.textContent).toContain('1 ownership unknown')
    expect(container.querySelector('a[href="/runs"]')?.textContent).toContain('Open Runs')
    await unmount()
  })

  it('shows a truthful unavailable state without inventing healthy counts', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ok: false, error: 'Unavailable' }), { status: 500 }))
    const { container, unmount } = await renderCard()
    expect(container.textContent).toContain('Runtime health unavailable')
    expect(container.textContent).not.toContain('0 ownership conflicts')
    await unmount()
  })
})
