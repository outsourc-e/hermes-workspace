// @vitest-environment jsdom
/**
 * US-501 — Placeholder detection at install confirmation.
 *
 * Tests:
 *  (a) clean template commits on first click (no placeholder form shown)
 *  (b) placeholder template requires fill before commit
 *  (c) partial fill keeps Install button disabled
 *  (d) full fill commits with merged overrides
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('@/components/ui/dialog', () => ({
  DialogRoot: ({ open, children }: {
    open: boolean
    children: React.ReactNode
  }) => open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { role: 'dialog' }, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', null, children),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    [k: string]: unknown
  }) => React.createElement('button', { onClick, disabled, ...props }, children),
}))

vi.mock('@/components/ui/toast', () => ({
  toast: vi.fn(),
}))

import { InstallConfirmationDialog } from './components/install-confirmation-dialog'
import type { HubMcpEntry } from './hooks/use-mcp-hub'
import { detectPlaceholders, isArgPlaceholder, isEnvPlaceholder, isUrlPlaceholder } from './lib/placeholder-detect'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderInto(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => { root.render(element) })
  return {
    container,
    unmount: async () => {
      await React.act(async () => { root.unmount() })
      document.body.removeChild(container)
    },
    rerender: async (el: React.ReactElement) => {
      await React.act(async () => { root.render(el) })
    },
  }
}

function getInstallBtn(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('[data-testid="install-confirm-btn"]') as HTMLButtonElement
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_ENTRY: HubMcpEntry = {
  id: 'clean',
  name: 'clean-mcp',
  description: 'No placeholders.',
  source: 'mcp-get',
  tags: [],
  trust: 'community',
  template: {
    name: 'clean-mcp',
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/real/path'],
    env: {},
  },
  installed: false,
  homepage: null,
}

const PLACEHOLDER_ENTRY: HubMcpEntry = {
  id: 'placeholder',
  name: 'placeholder-mcp',
  description: 'Has placeholder args + env.',
  source: 'mcp-get',
  tags: [],
  trust: 'community',
  template: {
    name: 'placeholder-mcp',
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '/path/to/mcp-server'],
    env: { MY_API_KEY: '' },
  },
  installed: false,
  homepage: null,
}

const URL_PLACEHOLDER_ENTRY: HubMcpEntry = {
  id: 'url-placeholder',
  name: 'url-placeholder-mcp',
  description: 'Has placeholder url.',
  source: 'local',
  tags: [],
  trust: 'unverified',
  template: {
    name: 'url-placeholder-mcp',
    transportType: 'http',
    url: 'https://example.com/mcp',
    env: {},
  },
  installed: false,
  homepage: null,
}

let originalFetch: typeof global.fetch

beforeEach(() => {
  originalFetch = global.fetch
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Unit tests: detectPlaceholders helper
// ---------------------------------------------------------------------------

describe('detectPlaceholders helper', () => {
  it('returns empty array for a clean template', () => {
    const result = detectPlaceholders(CLEAN_ENTRY.template)
    expect(result).toHaveLength(0)
  })

  it('detects /path/to/ in args', () => {
    const result = detectPlaceholders(PLACEHOLDER_ENTRY.template)
    const argPh = result.find((p) => p.kind === 'arg')
    expect(argPh).toBeDefined()
    expect(argPh?.path).toBe('args[1]')
    expect(argPh?.currentValue).toBe('/path/to/mcp-server')
  })

  it('detects empty value for secret env key', () => {
    const result = detectPlaceholders(PLACEHOLDER_ENTRY.template)
    const envPh = result.find((p) => p.kind === 'env')
    expect(envPh).toBeDefined()
    expect(envPh?.path).toBe('env.MY_API_KEY')
  })

  it('detects example.com in url', () => {
    const result = detectPlaceholders(URL_PLACEHOLDER_ENTRY.template)
    const urlPh = result.find((p) => p.kind === 'url')
    expect(urlPh).toBeDefined()
    expect(urlPh?.path).toBe('url')
  })

  it('detects angle-bracket tokens in args', () => {
    expect(isArgPlaceholder('<your-path>')).toBe(true)
    expect(isArgPlaceholder('<token>')).toBe(true)
    expect(isArgPlaceholder('<X>')).toBe(true)
    expect(isArgPlaceholder('/real/path')).toBe(false)
  })

  it('detects angle-bracket tokens in env values', () => {
    expect(isEnvPlaceholder('SOME_VAR', '<your-token>')).toBe(true)
    expect(isEnvPlaceholder('SOME_VAR', 'real-value')).toBe(false)
  })

  it('detects <your-host> in url', () => {
    expect(isUrlPlaceholder('https://<your-host>/mcp')).toBe(true)
    expect(isUrlPlaceholder('https://real-host.com/mcp')).toBe(false)
  })

  it('ignores non-secret empty env keys', () => {
    const result = detectPlaceholders({
      name: 'x',
      transportType: 'stdio',
      env: { VERBOSE: '' }, // VERBOSE doesn't match secret pattern
    })
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// (a) Clean template commits on first click — no placeholder form
// ---------------------------------------------------------------------------

describe('(a) clean template — commits on first click', () => {
  it('POSTs immediately on first Install click when no placeholders', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }) as unknown as typeof fetch

    const onClose = vi.fn()
    const onInstalled = vi.fn()
    const { container, unmount } = await renderInto(
      React.createElement(InstallConfirmationDialog, { entry: CLEAN_ENTRY, onClose, onInstalled }),
    )

    const btn = getInstallBtn(container)
    expect(btn.disabled).toBe(false)

    await React.act(async () => { btn.click() })
    await React.act(async () => { await Promise.resolve() })

    expect(global.fetch).toHaveBeenCalledOnce()
    expect(onInstalled).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    // No placeholder form shown
    expect(container.querySelector('[data-testid="placeholder-fill-form"]')).toBeNull()
    await unmount()
  })
})

// ---------------------------------------------------------------------------
// (b) Placeholder template requires fill before commit
// ---------------------------------------------------------------------------

describe('(b) placeholder template — shows fill form on first click', () => {
  it('does NOT POST on first click; shows fill form instead', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    const { container, unmount } = await renderInto(
      React.createElement(InstallConfirmationDialog, { entry: PLACEHOLDER_ENTRY, onClose: vi.fn() }),
    )

    const btn = getInstallBtn(container)
    await React.act(async () => { btn.click() })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="placeholder-fill-form"]')).not.toBeNull()
    await unmount()
  })

  it('Install button is disabled after showing placeholder form (unfilled)', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch

    const { container, unmount } = await renderInto(
      React.createElement(InstallConfirmationDialog, { entry: PLACEHOLDER_ENTRY, onClose: vi.fn() }),
    )

    const btn = getInstallBtn(container)
    await React.act(async () => { btn.click() })

    // After showing placeholder form with empty overrides, button must be disabled
    const btnAfter = getInstallBtn(container)
    expect(btnAfter.disabled).toBe(true)
    await unmount()
  })
})

// ---------------------------------------------------------------------------
// (c) Partial fill keeps button disabled
// ---------------------------------------------------------------------------

describe('(c) partial fill keeps Install disabled', () => {
  it('remains disabled when only some placeholders are filled', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch

    const { container, unmount } = await renderInto(
      React.createElement(InstallConfirmationDialog, { entry: PLACEHOLDER_ENTRY, onClose: vi.fn() }),
    )

    // First click — show fill form
    await React.act(async () => { getInstallBtn(container).click() })

    // Fill only the arg, leave env empty
    const argInput = container.querySelector(
      '[data-testid="placeholder-input-args[1]"]',
    ) as HTMLInputElement | null
    expect(argInput).not.toBeNull()

    await React.act(async () => {
      if (argInput) {
        argInput.value = '/real/path/to/server'
        argInput.dispatchEvent(new Event('input', { bubbles: true }))
        // React listens to 'change' for inputs
        argInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    // Install button should still be disabled (env still empty)
    expect(getInstallBtn(container).disabled).toBe(true)
    await unmount()
  })
})

// ---------------------------------------------------------------------------
// (d) Full fill commits with merged overrides
// ---------------------------------------------------------------------------

describe('(d) full fill — commits with merged overrides', () => {
  it('POSTs with overridden values when all placeholders are filled', async () => {
    let capturedBody: unknown = null
    global.fetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string)
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }) as unknown as typeof fetch

    const onInstalled = vi.fn()
    const onClose = vi.fn()
    const { container, unmount } = await renderInto(
      React.createElement(InstallConfirmationDialog, {
        entry: PLACEHOLDER_ENTRY,
        onClose,
        onInstalled,
      }),
    )

    // First click — show fill form
    await React.act(async () => { getInstallBtn(container).click() })

    // Fill arg placeholder
    const argInput = container.querySelector(
      '[data-testid="placeholder-input-args[1]"]',
    ) as HTMLInputElement
    await React.act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(argInput, '/real/path/mcp')
      argInput.dispatchEvent(new Event('input', { bubbles: true }))
      argInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Fill env placeholder
    const envInput = container.querySelector(
      '[data-testid="placeholder-input-env.MY_API_KEY"]',
    ) as HTMLInputElement
    await React.act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(envInput, 'my-real-api-key')
      envInput.dispatchEvent(new Event('input', { bubbles: true }))
      envInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Now click Install again
    await React.act(async () => { getInstallBtn(container).click() })
    await React.act(async () => { await Promise.resolve() })

    expect(global.fetch).toHaveBeenCalledOnce()
    expect(capturedBody).toMatchObject({
      name: 'placeholder-mcp',
      transportType: 'stdio',
      command: 'npx',
    })
    // Overridden arg at index 1
    const body = capturedBody as { args: string[]; env: Record<string, string> }
    expect(body.args[1]).toBe('/real/path/mcp')
    expect(body.env['MY_API_KEY']).toBe('my-real-api-key')
    expect(onInstalled).toHaveBeenCalledOnce()
    await unmount()
  })
})
