// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RunsScreen } from './runs-screen'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const router = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => router.navigate,
  useSearch: () => router.search,
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) =>
    React.createElement('a', { href: to, ...props }, children),
}))

const run = {
  id: 'codex:thread-1234567890abcdef',
  source: 'provider-runtime',
  provider: 'codex',
  runtimeKind: 'codex_thread',
  nativeId: 'thread-1234567890abcdef',
  shortId: 'thread-12345',
  account: 'OpenAI Codex',
  accountKey: 'openai-codex',
  route: 'openai-codex/gpt-5.6-sol',
  model: 'gpt-5.6-sol',
  project: 'Workspace',
  worktree: 'C:/work/Workspace',
  cwd: 'C:/work/Workspace',
  title: 'Workspace · Codex thread',
  state: 'idle',
  hostKind: 'stdio',
  linked: false,
  kanbanTaskId: null,
  parentRuntimeId: null,
  ownership: { state: 'free', owner: null, expiresAt: null, abandoned: false },
  capabilities: {
    fork: { state: 'unsupported', invokable: false, explanation: 'Disabled until provider fork identity has crash-safe durable recovery or idempotency.' },
    resume: { state: 'experimental', invokable: true, explanation: 'Bounded local resume.' },
    steer: { state: 'unsupported', invokable: false, explanation: 'No persistent connection.' },
    interrupt: { state: 'unsupported', invokable: false, explanation: 'No persistent connection.' },
    archive: { state: 'experimental', invokable: true, explanation: 'Bounded local archive.' },
    status: { state: 'supported', invokable: true, explanation: 'Metadata status.' },
  },
  createdAt: 100,
  updatedAt: 200,
  stalenessMs: 800,
}

function inventory(runs = [run]) {
  return {
    ok: true,
    runs,
    summary: {
      total: runs.length, active: 0, idle: runs.length, stopped: 0, attention: 0,
      idleResumable: runs.length, linkedKanban: 0, unlinkedKanban: runs.length,
      owned: 0, recoverable: 0, unknownOwnership: 0, stale: 0,
      byProvider: { codex: runs.length }, byState: { active: 0, idle: runs.length, stopped: 0, attention: 0 },
    },
    page: { number: 1, size: 25, total: runs.length, pages: 1, hasNext: false, hasPrevious: false },
    inventory: { projected: runs.length, matched: runs.length, truncated: false },
    availableRoutes: [
      { id: 'openai-codex/gpt-5.6-sol', account: 'openai-codex', model: 'gpt-5.6-sol', status: 'available' },
      { id: 'claude-cwm4tx/opus-5', account: 'cwm4tx', model: 'opus-5', status: 'available' },
    ],
    generatedAt: 1_000,
  }
}

async function settle() {
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

async function renderScreen() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => { root.render(<RunsScreen />) })
  await settle()
  return {
    container,
    unmount: async () => {
      await React.act(async () => { root.unmount() })
      container.remove()
    },
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  router.search = { view: 'recent', kanban: 'all', page: 1, size: 25, sort: 'updated', direction: 'desc' }
  router.navigate.mockReset()
  fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
    return new Response(JSON.stringify(inventory()), { status: 200 })
  })
  global.fetch = fetchMock as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('RunsScreen', () => {
  it('loads metadata without refreshing providers and renders a compact semantic table', async () => {
    const { container, unmount } = await renderScreen()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/runtime-runs')
    expect(init?.method).not.toBe('POST')
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelector('caption')?.textContent).toContain('1 of 1')
    expect(container.textContent).toContain('Workspace · Codex thread')
    expect(container.textContent).toContain('OpenAI Codex')
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('1 run')
    expect(container.querySelector('a[href="/conductor"]')?.textContent).toContain('New run')
    await unmount()
  })

  it('opens a deep-linked accessible detail drawer with truthful disabled-action help', async () => {
    router.search = { ...router.search, run: run.id }
    const { container, unmount } = await renderScreen()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    if (!dialog) throw new Error('Expected run detail dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const tableBranch = container.querySelector('table')?.parentElement
    expect(tableBranch?.hasAttribute('inert')).toBe(true)
    expect(tableBranch?.getAttribute('aria-hidden')).toBe('true')
    expect(dialog.textContent).toContain(run.nativeId)
    expect(dialog.textContent).toContain(run.worktree)
    const fork = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Fork')
    expect(fork?.hasAttribute('disabled')).toBe(true)
    const helpId = fork?.getAttribute('aria-describedby')
    expect(helpId).toBeTruthy()
    expect(container.querySelector(`#${helpId}`)?.textContent.toLowerCase()).toContain('recovery')
    const close = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Close')
    await React.act(async () => { close?.click() })
    expect(router.navigate).toHaveBeenCalledWith(expect.objectContaining({
      to: '/runs',
      replace: true,
      search: expect.any(Function),
    }))
    await unmount()
  })

  it('opens a deep-linked run returned outside the current page', async () => {
    const selectedRun = { ...run, id: 'codex:off-page', nativeId: 'off-page', shortId: 'off-page' }
    router.search = { ...router.search, run: selectedRun.id }
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      ...inventory([]),
      selectedRun,
    }), { status: 200 }))

    const { container, unmount } = await renderScreen()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('off-page')
    expect(container.textContent).not.toContain('not in the current filters or page')
    await unmount()
  })

  it('keeps actions disabled when a recorded route is no longer eligible', async () => {
    const staleRouteRun = { ...run, id: 'codex:stale-route', route: 'openai-codex/retired' }
    router.search = { ...router.search, run: staleRouteRun.id }
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(inventory([staleRouteRun])), { status: 200 }))
    const { container, unmount } = await renderScreen()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    const archive = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Archive')
    expect(archive?.hasAttribute('disabled')).toBe(true)
    const routeSelect = dialog?.querySelector('select#run-route-ref')
    expect(Array.from(routeSelect?.querySelectorAll('option') ?? []).map((option) => option.getAttribute('value')))
      .not.toContain('openai-codex/gpt-5.6-sol')
    expect(dialog?.textContent).not.toContain('openai-codex/retired (recorded)')
    await unmount()
  })

  it('rejects an available route owned by a different account key', async () => {
    const otherAccountRun = { ...run, id: 'codex:other-account', account: 'Other Codex', accountKey: 'other-codex' }
    router.search = { ...router.search, run: otherAccountRun.id }
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(inventory([otherAccountRun])), { status: 200 }))
    const { container, unmount } = await renderScreen()
    const dialog = container.querySelector('[role="dialog"]')
    const archive = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Archive')
    expect(archive?.hasAttribute('disabled')).toBe(true)
    await unmount()
  })

  it('keeps provider discovery explicit and preserves current URL filters after refresh', async () => {
    router.search = { ...router.search, provider: 'codex', q: 'workspace' }
    const { container, unmount } = await renderScreen()
    const refresh = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Refresh'))
    expect(refresh).toBeTruthy()
    await React.act(async () => { refresh?.click() })
    await settle()
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ action: 'refresh' })
    const gets = fetchMock.mock.calls.filter(([, init]) => init?.method !== 'POST')
    expect(gets.length).toBeGreaterThanOrEqual(2)
    expect(String(gets.at(-1)?.[0])).toContain('provider=codex')
    expect(String(gets.at(-1)?.[0])).toContain('q=workspace')
    expect(router.navigate).not.toHaveBeenCalledWith(expect.objectContaining({ search: expect.objectContaining({ text: expect.anything() }) }))
    await unmount()
  })

  it('keeps Claude follow-up and Kanban text local while dispatching route-authorized actions', async () => {
    const claude = {
      ...run,
      id: 'claude:cwm4tx:session-1', provider: 'claude', runtimeKind: 'claude_session', nativeId: 'session-1', shortId: 'session-1',
      account: 'cwm4tx', accountKey: 'cwm4tx', route: 'claude-cwm4tx/opus-5', model: 'opus-5', title: 'Workspace · Claude session',
      capabilities: {
        ...run.capabilities,
        resume: { state: 'experimental', invokable: true, explanation: 'Isolated Claude resume.' },
        archive: { state: 'degraded', invokable: true, explanation: 'Metadata archive.' },
      },
    }
    router.search = { ...router.search, run: claude.id }
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
      return new Response(JSON.stringify(inventory([claude])), { status: 200 })
    })
    const { container, unmount } = await renderScreen()
    const followUp = container.querySelector('textarea[aria-label="Follow-up text"]')
    expect(followUp).not.toBeNull()
    if (!(followUp instanceof HTMLTextAreaElement)) throw new Error('Expected follow-up textarea')
    await React.act(async () => { setNativeValue(followUp, 'continue safely') })
    const resume = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Resume')
    await React.act(async () => { resume?.click() })
    await settle()
    const kanban = container.querySelector('input[aria-label="Kanban task ID"]')
    expect(kanban).not.toBeNull()
    if (!(kanban instanceof HTMLInputElement)) throw new Error('Expected Kanban input')
    await React.act(async () => { setNativeValue(kanban, 'AUTH-14') })
    const link = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Link Kanban')
    await React.act(async () => { link?.click() })
    await settle()
    const payloads = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)))
    expect(payloads).toContainEqual(expect.objectContaining({
      action: 'resume', runtimeId: claude.id, routeRef: 'claude-cwm4tx/opus-5', prompt: 'continue safely',
    }))
    expect(payloads).toContainEqual({ action: 'link_kanban', runtimeId: claude.id, kanbanTaskId: 'AUTH-14' })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('link_kanban accepted')
    expect(router.navigate).not.toHaveBeenCalledWith(expect.objectContaining({ search: expect.objectContaining({ prompt: expect.anything() }) }))
    await unmount()
  })
})
