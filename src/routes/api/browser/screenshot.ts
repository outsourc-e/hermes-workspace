import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { gatewayRpc } from '../../../server/gateway'

type UnknownRecord = Record<string, unknown>

const BROWSER_SCREENSHOT_METHODS = [
  'browser',           // Current OpenClaw API — single method with action param
  'browser.screenshot',
  'browser_screenshot',
  'browser.snapshot',
  'browser_snapshot',
  'browser.get_screenshot',
  'browser.getScreenshot',
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

function readErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message || 'Browser screenshot unavailable'
  if (typeof error === 'string' && error.trim()) return error
  return 'Browser screenshot unavailable'
}

function isGatewaySupportRequired(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase()
  return GATEWAY_SUPPORT_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern),
  )
}

async function callBrowserScreenshot(params?: unknown): Promise<unknown> {
  let lastError: unknown = null
  for (const method of BROWSER_SCREENSHOT_METHODS) {
    try {
      // Current OpenClaw uses single 'browser' method with action param
      const rpcParams = method === 'browser'
        ? { action: 'screenshot', ...(params && typeof params === 'object' ? params : {}) }
        : params
      return await gatewayRpc(method, rpcParams)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gateway browser screenshot request failed')
}

function resolvePayloadRecord(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload)) return null
  if (isRecord(payload.data)) return payload.data
  if (isRecord(payload.result)) return payload.result
  return payload
}

function coerceImageDataUrl(payload: UnknownRecord): string {
  const imageDataUrl =
    readString(payload.imageDataUrl) ||
    readString(payload.dataUrl) ||
    readString(payload.screenshotUrl)
  if (imageDataUrl) return imageDataUrl

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

export const Route = createFileRoute('/api/browser/screenshot')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const tabId = url.searchParams.get('tabId')
          const payload = await callBrowserScreenshot(
            tabId ? { tabId, targetId: tabId } : undefined,
          )
          const payloadRecord = resolvePayloadRecord(payload)

          if (!payloadRecord) {
            throw new Error('Gateway returned an invalid screenshot payload')
          }

          const imageDataUrl = coerceImageDataUrl(payloadRecord)
          if (!imageDataUrl) {
            throw new Error(
              'Gateway returned a screenshot payload without image data',
            )
          }

          return json({
            ok: true,
            imageDataUrl,
            currentUrl:
              readString(payloadRecord.currentUrl) ||
              readString(payloadRecord.url) ||
              readString(payloadRecord.href) ||
              'about:blank',
            activeTabId:
              readString(payloadRecord.activeTabId) ||
              readString(payloadRecord.tabId) ||
              readString(payloadRecord.targetId) ||
              tabId ||
              null,
            capturedAt: new Date().toISOString(),
            demoMode: false,
            gatewaySupportRequired: false,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              imageDataUrl: '',
              currentUrl: '',
              activeTabId: null,
              capturedAt: new Date().toISOString(),
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
