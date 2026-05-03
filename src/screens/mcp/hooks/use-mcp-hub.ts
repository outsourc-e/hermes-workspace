import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { HubMcpEntry } from '@/server/mcp-hub/types'

export type { HubMcpEntry }

export interface McpHubResponse {
  ok: boolean
  results: Array<HubMcpEntry>
  source: string
  total: number
  warnings?: Array<string>
  error?: string
}

export function useMcpHub(searchInput: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(searchInput)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(searchInput)
    }, 250)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [searchInput])

  return useQuery({
    queryKey: ['mcp', 'hub-search', debouncedQuery],
    queryFn: async (): Promise<McpHubResponse> => {
      const params = new URLSearchParams()
      params.set('q', debouncedQuery)
      params.set('source', 'all')
      params.set('limit', '20')
      const res = await fetch(`/api/mcp/hub-search?${params.toString()}`)
      if (!res.ok && res.status !== 200) {
        throw new Error(`MCP hub search failed (${res.status})`)
      }
      const body = (await res.json()) as Partial<McpHubResponse>
      return {
        ok: body.ok ?? false,
        results: body.results ?? [],
        source: body.source ?? 'unknown',
        total: body.total ?? 0,
        warnings: body.warnings,
        error: body.error,
      }
    },
    staleTime: 5 * 60 * 1_000, // 5 min
    refetchOnWindowFocus: false,
  })
}
