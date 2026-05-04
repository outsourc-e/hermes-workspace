import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { McpServer, McpTestResult } from '@/types/mcp'

/**
 * OAuth reauth helper.
 *
 * Opens the server's `url` (or a discovered `authorizationUrl`) in a new tab,
 * then polls `POST /api/mcp/test` every 2s until status === 'connected' or
 * 60s elapses. On success, invalidates the ['mcp', 'servers'] query so the
 * card re-renders with fresh status.
 *
 * Returns a mutation-like shape so callers can wire spinners/errors easily.
 */
export interface UseMcpOauthResult {
  start: (server: McpServer) => Promise<McpTestResult | null>
  isPending: boolean
  isError: boolean
  error: Error | null
  data: McpTestResult | null
}

const POLL_INTERVAL_MS = 2_000
const TIMEOUT_MS = 60_000

export function useMcpOauth(): UseMcpOauthResult {
  const qc = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [data, setData] = useState<McpTestResult | null>(null)

  const start = useCallback(
    async (server: McpServer): Promise<McpTestResult | null> => {
      setIsPending(true)
      setIsError(false)
      setError(null)
      setData(null)

      // Best-effort: prefer the server's url (which typically is the auth or
      // mcp endpoint); the agent surfaces a real authorizationUrl elsewhere if
      // it has one. Skip opening a tab on the server during SSR.
      if (typeof window !== 'undefined') {
        const target =
          (server as McpServer & { authorizationUrl?: string }).authorizationUrl ||
          server.url
        if (target) {
          try {
            window.open(target, '_blank', 'noopener,noreferrer')
          } catch {
            /* popup blocked — caller should advise user */
          }
        }
      }

      const deadline = Date.now() + TIMEOUT_MS
      try {
        while (Date.now() < deadline) {
          const res = await fetch('/api/mcp/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: server.name }),
          })
          const payload = (await res.json().catch(() => ({}))) as McpTestResult
          if (res.ok && payload.status === 'connected') {
            setData(payload)
            setIsPending(false)
            qc.invalidateQueries({ queryKey: ['mcp', 'servers'] })
            return payload
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        }
        const timeoutErr = new Error('OAuth reauth timed out after 60s')
        setError(timeoutErr)
        setIsError(true)
        setIsPending(false)
        return null
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        setIsError(true)
        setIsPending(false)
        return null
      }
    },
    [qc],
  )

  return { start, isPending, isError, error, data }
}
