/**
 * local-file source adapter.
 *
 * Wraps the Phase 2 mcp-presets-store and converts its presets to
 * HubMcpEntry[] with source='local' and trust='official'.
 */
import { readPresets } from '../../mcp-presets-store'
import type { HubMcpEntry } from '../types'

export interface LocalFileResult {
  entries: HubMcpEntry[]
  warnings?: string[]
}

export async function fetchLocalFile(): Promise<LocalFileResult> {
  const result = await readPresets()
  const warnings: string[] = []

  if (result.source === 'invalid') {
    warnings.push(
      result.error
        ? `local-file: ${result.error}`
        : 'local-file: catalog file is invalid',
    )
    return { entries: [], warnings }
  }

  if (result.warnings && result.warnings.length > 0) {
    for (const w of result.warnings) {
      warnings.push(`local-file: ${w.path ? `${w.path}: ` : ''}${w.message}`)
    }
  }

  const entries: HubMcpEntry[] = result.presets.map((preset) => ({
    id: `local:${preset.name}`,
    name: preset.name,
    description: preset.description,
    source: 'local' as const,
    homepage: preset.homepage ?? null,
    tags: preset.tags ?? [],
    trust: 'official' as const,
    template: preset.template,
    installed: false, // set later by unifiedSearch
  }))

  return { entries, ...(warnings.length > 0 ? { warnings } : {}) }
}
