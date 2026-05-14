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

const FEATURE_PROBES: Record<EnhancedFeature, Array<string>> = {
  sessions: ['/api/sessions'],
  skills: ['/api/gateway-status', '/api/skills'],
  memory: ['/api/gateway-status', '/api/memory/list'],
  config: ['/api/gateway-status', '/api/claude-config'],
  jobs: ['/api/gateway-status', '/api/claude-jobs'],
  mcp: ['/api/gateway-status', '/api/mcp'],
  mcpFallback: ['/api/gateway-status', '/api/mcp'],
  kanban: ['/api/gateway-status', '/api/swarm-kanban'],
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
  const normalized = normalizeFeature(feature)
  const probes = normalized
    ? FEATURE_PROBES[normalized].join(' or ')
    : '/api/gateway-status'
  return `${getFeatureLabel(feature)} is not reachable through the local Hermes Workspace probes yet. Verify ${probes} before starting another gateway; if those endpoints pass, refresh or reprobe the Workspace UI.`
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
