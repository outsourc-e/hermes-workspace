// FIX: removed import of getCapabilities from server/gateway-capabilities — that module
// transitively imports node:sqlite (local-db.ts) which cannot be bundled for the browser.
// isFeatureAvailable was the only consumer and had no callers, so it is removed below.

export type EnhancedFeature =
  | 'sessions'
  | 'skills'
  | 'memory'
  | 'config'
  | 'jobs'
  | 'mcp'
  | 'mcpFallback'
  | 'kanban'

const FEATURE_LABELS: Record<EnhancedFeature, string> = {
  sessions: 'Sessions',
  skills: 'Skills',
  memory: 'Memory',
  config: 'Configuration',
  jobs: 'Jobs',
  mcp: 'MCP Servers',
  mcpFallback: 'MCP Servers (config fallback)',
  kanban: 'Kanban (Hermes plugin)',
}

function normalizeFeature(
  feature: EnhancedFeature | string,
): EnhancedFeature | null {
  const normalized = feature.trim().toLowerCase()
  if (
    normalized === 'sessions' ||
    normalized === 'skills' ||
    normalized === 'memory' ||
    normalized === 'config' ||
    normalized === 'jobs' ||
    normalized === 'mcp' ||
    normalized === 'mcpfallback' ||
    normalized === 'kanban'
  ) {
    return normalized === 'mcpfallback' ? 'mcpFallback' : normalized
  }

  return null
}

export function getFeatureLabel(feature: EnhancedFeature | string): string {
  const normalized = normalizeFeature(feature)
  if (!normalized) return feature
  return FEATURE_LABELS[normalized]
}

export function getUnavailableReason(
  feature: EnhancedFeature | string,
): string {
  return `${getFeatureLabel(feature)} requires a Hermes gateway that exposes the extended APIs. Check that Hermes Agent is installed and running with \`hermes gateway run\`.`
}

export function createCapabilityUnavailablePayload(
  feature: EnhancedFeature,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ok: false,
    code: 'capability_unavailable',
    capability: feature,
    source: 'portable',
    message: getUnavailableReason(feature),
    ...extra,
  }
}
