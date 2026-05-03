/**
 * React Query hooks for MCP Hub Sources — Phase 3.2.
 *
 * useQuery: fetches all sources (built-ins + user-defined).
 * Mutations: add, update, delete — each invalidates hub-search.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HubSourceEntry } from '@/server/mcp-hub-sources-store'

export type { HubSourceEntry }

export interface HubSourcesResponse {
  ok: boolean
  sources: HubSourceEntry[]
  source: string
  error?: string
  validationErrors?: Array<{ path: string; message: string }>
}

export interface MutationError {
  path: string
  message: string
}

const QUERY_KEY = ['mcp', 'hub-sources'] as const

async function fetchSources(): Promise<HubSourcesResponse> {
  const res = await fetch('/api/mcp/hub-sources')
  if (!res.ok && res.status !== 200) {
    throw new Error(`hub-sources fetch failed (${res.status})`)
  }
  const body = (await res.json()) as Partial<HubSourcesResponse>
  return {
    ok: body.ok ?? false,
    sources: body.sources ?? [],
    source: body.source ?? 'unknown',
    error: body.error,
    validationErrors: body.validationErrors,
  }
}

export function useMcpHubSources() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSources,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export interface AddSourceInput {
  id: string
  name: string
  url: string
  trust: 'official' | 'community' | 'unverified'
  format: 'smithery' | 'generic-json'
  enabled: boolean
}

export type UpdateSourceInput = Omit<AddSourceInput, 'id'>

export function useAddHubSource() {
  const qc = useQueryClient()
  return useMutation<
    { ok: true; sources: HubSourceEntry[] },
    { errors: MutationError[] },
    AddSourceInput
  >({
    mutationFn: async (input) => {
      const res = await fetch('/api/mcp/hub-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const body = await res.json() as { ok: boolean; sources?: HubSourceEntry[]; errors?: MutationError[] }
      if (!body.ok) {
        throw { errors: body.errors ?? [{ path: '', message: 'Unknown error' }] }
      }
      return { ok: true, sources: body.sources ?? [] }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['mcp', 'hub-search'] })
    },
  })
}

export function useUpdateHubSource() {
  const qc = useQueryClient()
  return useMutation<
    { ok: true; sources: HubSourceEntry[] },
    { errors: MutationError[] },
    { id: string; input: UpdateSourceInput }
  >({
    mutationFn: async ({ id, input }) => {
      const res = await fetch(`/api/mcp/hub-sources/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const body = await res.json() as { ok: boolean; sources?: HubSourceEntry[]; errors?: MutationError[] }
      if (!body.ok) {
        throw { errors: body.errors ?? [{ path: '', message: 'Unknown error' }] }
      }
      return { ok: true, sources: body.sources ?? [] }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['mcp', 'hub-search'] })
    },
  })
}

export function useDeleteHubSource() {
  const qc = useQueryClient()
  return useMutation<
    { ok: true; sources: HubSourceEntry[] },
    { errors: MutationError[] },
    string
  >({
    mutationFn: async (id) => {
      const res = await fetch(`/api/mcp/hub-sources/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const body = await res.json() as { ok: boolean; sources?: HubSourceEntry[]; errors?: MutationError[] }
      if (!body.ok) {
        throw { errors: body.errors ?? [{ path: '', message: 'Unknown error' }] }
      }
      return { ok: true, sources: body.sources ?? [] }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['mcp', 'hub-search'] })
    },
  })
}
