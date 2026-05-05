import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
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

const PAGE_SIZE = 50

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

  const infinite = useInfiniteQuery({
    queryKey: ['mcp', 'hub-search', debouncedQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<McpHubResponse> => {
      const params = new URLSearchParams()
      params.set('q', debouncedQuery)
      params.set('source', 'all')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(pageParam))
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
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    staleTime: 5 * 60 * 1_000,
    refetchOnWindowFocus: false,
  })

  // Flatten across pages so existing components that read .data.results keep working.
  const flattened: McpHubResponse | undefined = infinite.data
    ? {
        ok: infinite.data.pages[0]?.ok ?? false,
        source: infinite.data.pages[0]?.source ?? 'unknown',
        total: infinite.data.pages[0]?.total ?? 0,
        warnings: infinite.data.pages[0]?.warnings,
        error: infinite.data.pages[0]?.error,
        results: infinite.data.pages.flatMap((p) => p.results),
      }
    : undefined

  return {
    ...infinite,
    data: flattened,
    fetchNextPage: infinite.fetchNextPage,
    hasNextPage: infinite.hasNextPage,
    isFetchingNextPage: infinite.isFetchingNextPage,
  }
}
