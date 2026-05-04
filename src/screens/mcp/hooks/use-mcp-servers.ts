import { useQuery } from '@tanstack/react-query'
import type { McpListResponse } from '@/types/mcp'

export interface UseMcpServersParams {
  tab: 'installed' | 'catalog' | 'all'
  category: string
  search: string
}

export function useMcpServers(params: UseMcpServersParams) {
  return useQuery({
    queryKey: ['mcp', 'servers', params],
    queryFn: async (): Promise<McpListResponse> => {
      const url = new URL('/api/mcp', window.location.origin)
      if (params.search) url.searchParams.set('search', params.search)
      if (params.category && params.category !== 'All') {
        url.searchParams.set('category', params.category)
      }
      const res = await fetch(url.toString().replace(window.location.origin, ''))
      if (!res.ok) throw new Error(`MCP list failed (${res.status})`)
      const body = (await res.json()) as Partial<McpListResponse> & {
        ok?: boolean
        code?: string
      }
      return {
        servers: body.servers ?? [],
        total: body.total ?? 0,
        categories: body.categories ?? ['All'],
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}
