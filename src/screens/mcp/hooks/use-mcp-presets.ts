import { useQuery } from '@tanstack/react-query'
import type { McpClientInput } from '@/types/mcp'

export interface McpPreset {
  id: string
  name: string
  description: string
  category: string
  homepage?: string
  tags?: Array<string>
  template: McpClientInput
}

export type McpPresetSource = 'user-file' | 'seed' | 'invalid'

export interface McpPresetValidationIssue {
  path: string
  message: string
}

export interface McpPresetsResponse {
  ok: boolean
  presets: Array<McpPreset>
  source: McpPresetSource
  error?: string
  errorPath?: string
  validationErrors?: Array<McpPresetValidationIssue>
  warnings?: Array<McpPresetValidationIssue>
}

export function useMcpPresets() {
  return useQuery({
    queryKey: ['mcp', 'presets'],
    queryFn: async (): Promise<McpPresetsResponse> => {
      const res = await fetch('/api/mcp/presets')
      if (!res.ok && res.status !== 200) {
        throw new Error(`MCP presets failed (${res.status})`)
      }
      const body = (await res.json()) as Partial<McpPresetsResponse>
      return {
        ok: body.ok ?? false,
        presets: body.presets ?? [],
        source: (body.source as McpPresetSource) ?? 'invalid',
        error: body.error,
        errorPath: body.errorPath,
        validationErrors: body.validationErrors,
        warnings: body.warnings,
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}
