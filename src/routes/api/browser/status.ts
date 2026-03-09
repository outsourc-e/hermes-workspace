import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../../server/gateway'
import { isAuthenticated } from '../../../server/auth-middleware'

type UnknownRecord = Record<string, unknown>

type BrowserStatusResponse = {
  active: boolean
  url?: string
  screenshotUrl?: string
  message?: string
  gatewaySupportRequired?: boolean
}

const UNSUPPORTED_MESSAGE =
  'Browser control available when gateway supports browser RPC'
const NO_ACTIVE_SESSION_MESSAGE = 'No active browser session'
const BROWSER_STATUS_METHODS = [
  'browser',           // Current OpenClaw API — single method with action param
  'browser.status',
  'browser_status',
  'browser.get_status',
  'browser.getStatus',
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
  if (error instanceof Error) return error.message || UNSUPPORTED_MESSAGE
  if (typeof error === 'string' && error.trim()) return error
  return UNSUPPORTED_MESSAGE
}

function isGatewaySupportRequired(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase()
  return GATEWAY_SUPPORT_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern),
  )
}

async function callBrowserStatus(): Promise<unknown> {
  let lastError: unknown = null
  for (const method of BROWSER_STATUS_METHODS) {
    try {
      const params = method === 'browser' ? { action: 'status' } : undefined
      return await gatewayRpc(method, params)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gateway browser status request failed')
}

function coerceScreenshotUrl(payload: UnknownRecord): string {
  const screenshotUrl =
    readString(payload.screenshotUrl) ||
    readString(payload.imageDataUrl) ||
    readString(payload.dataUrl)
  if (screenshotUrl) return screenshotUrl

  const screenshot = readString(payload.screenshot)
  if (
    screenshot.startsWith('data:image/') ||
    screenshot.startsWith('http://') ||
    screenshot.startsWith('https://')
  ) {
    return screenshot
  }

  const image = readString(payload.image)
  if (image.startsWith('data:image/')) return image
  if (image) {
    const mimeType = readString(payload.mimeType) || 'image/png'
    return `data:${mimeType};base64,${image}`
  }

  const base64 = readString(payload.base64)
  if (base64) {
    const mimeType = readString(payload.mimeType) || 'image/png'
    return `data:${mimeType};base64,${base64}`
  }

  return ''
}

function resolveStatusRecord(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload)) return null
  if (isRecord(payload.status)) return payload.status
  if (isRecord(payload.data)) return payload.data
  return payload
}

function normalizeStatusPayload(payload: unknown): BrowserStatusResponse {
  const statusRecord = resolveStatusRecord(payload)
  if (!statusRecord) {
    return {
      active: false,
      message: NO_ACTIVE_SESSION_MESSAGE,
    }
  }

  const url =
    readString(statusRecord.url) ||
    readString(statusRecord.currentUrl) ||
    readString(statusRecord.href)
  const screenshotUrl = coerceScreenshotUrl(statusRecord)
  const active =
    readBoolean(statusRecord.active) ||
    readBoolean(statusRecord.isActive) ||
    readBoolean(statusRecord.hasActiveSession) ||
    readBoolean(statusRecord.connected) ||
    Boolean(url) ||
    Boolean(screenshotUrl)

  if (!active) {
    return {
      active: false,
      message: NO_ACTIVE_SESSION_MESSAGE,
    }
  }

  return {
    active: true,
    url: url || 'about:blank',
    screenshotUrl,
  }
}

export const Route = createFileRoute('/api/browser/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const payload = await callBrowserStatus()
          return json(normalizeStatusPayload(payload))
        } catch (error) {
          return json({
            active: false,
            message: readErrorMessage(error) || UNSUPPORTED_MESSAGE,
            gatewaySupportRequired: isGatewaySupportRequired(error),
          } satisfies BrowserStatusResponse)
        }
      },
    },
  },
})
