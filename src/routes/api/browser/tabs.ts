import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { gatewayRpc } from '../../../server/gateway'

type UnknownRecord = Record<string, unknown>

type BrowserTab = {
  id: string
  title: string
  url: string
  isActive: boolean
}

const BROWSER_TABS_METHODS = [
  'browser',           // Current OpenClaw API — single method with action param
  'browser.tabs',
  'browser_tabs',
  'browser.get_tabs',
  'browser.getTabs',
  'browser.list_tabs',
  'browser_list_tabs',
]

const GATEWAY_SUPPORT_ERROR_PATTERNS = [
  'missing gateway auth',
  'gateway connection closed',
  'connect econnrefused',
  'method not found',
  'unknown method',
  'not implemented',
  'unsupported',
  'browser api unavailable',
  'browser tool request failed',
]

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || 'Browser tabs unavailable'
  if (typeof error === 'string' && error.trim()) return error
  return 'Browser tabs unavailable'
}

function isGatewaySupportRequired(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase()
  return GATEWAY_SUPPORT_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern),
  )
}

async function callBrowserTabs(): Promise<unknown> {
  let lastError: unknown = null
  for (const method of BROWSER_TABS_METHODS) {
    try {
      // Current OpenClaw uses single 'browser' method with action param
      const params = method === 'browser' ? { action: 'tabs' } : undefined
      return await gatewayRpc(method, params)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gateway browser tabs request failed')
}

function normalizeTab(tab: unknown, index: number, activeTabId?: string): BrowserTab {
  if (!isRecord(tab)) {
    return {
      id: `tab-${index + 1}`,
      title: `Tab ${index + 1}`,
      url: 'about:blank',
      isActive: false,
    }
  }

  const id =
    readString(tab.id) ||
    readString(tab.tabId) ||
    readString(tab.targetId) ||
    `tab-${index + 1}`

  return {
    id,
    title: readString(tab.title) || `Tab ${index + 1}`,
    url: readString(tab.url) || readString(tab.href) || 'about:blank',
    isActive:
      id === activeTabId ||
      readBoolean(tab.active) ||
      readBoolean(tab.isActive) ||
      readBoolean(tab.selected),
  }
}

function resolvePayloadRecord(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload)) return null
  if (isRecord(payload.data)) return payload.data
  if (isRecord(payload.result)) return payload.result
  return payload
}

export const Route = createFileRoute('/api/browser/tabs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const payload = await callBrowserTabs()
          const payloadRecord = resolvePayloadRecord(payload)
          const rawTabs = Array.isArray(payload)
            ? payload
            : Array.isArray(payloadRecord?.tabs)
              ? payloadRecord.tabs
              : Array.isArray(payloadRecord?.items)
                ? payloadRecord.items
                : Array.isArray(payloadRecord?.targets)
                  ? payloadRecord.targets
                  : []

          const activeTabId =
            (payloadRecord &&
              (readString(payloadRecord.activeTabId) ||
                readString(payloadRecord.tabId) ||
                readString(payloadRecord.targetId))) ||
            ''

          const tabs = rawTabs.map((tab, index) => normalizeTab(tab, index, activeTabId))
          const resolvedActiveTabId =
            tabs.find((tab) => tab.isActive)?.id || tabs[0]?.id || null

          const normalizedTabs = tabs.map((tab) => ({
            ...tab,
            isActive: resolvedActiveTabId ? tab.id === resolvedActiveTabId : false,
          }))

          return json({
            ok: true,
            tabs: normalizedTabs,
            activeTabId: resolvedActiveTabId,
            updatedAt: new Date().toISOString(),
            demoMode: false,
            gatewaySupportRequired: false,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              tabs: [],
              activeTabId: null,
              updatedAt: new Date().toISOString(),
              demoMode: false,
              gatewaySupportRequired: isGatewaySupportRequired(error),
              error: readErrorMessage(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
