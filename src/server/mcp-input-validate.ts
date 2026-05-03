/**
 * MCP server input validator — server-only.
 *
 * Promoted from `src/routes/api/mcp.ts` so Phase 2's preset-store can reuse
 * the same coercion + validation rules. Returns a discriminated result so
 * callers can surface field-level errors instead of a bare 400.
 */
import type { McpServerInput } from '../types/mcp-input'

export interface ValidationError {
  path: string
  message: string
}

export type ValidateResult =
  | { ok: true; value: McpServerInput }
  | { ok: false; errors: Array<ValidationError> }

const ENV_KEY_RE = /^[A-Z][A-Z0-9_]*$/

function isHttpsLikeUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate + coerce an unknown payload into the server-side `McpServerInput`
 * shape. Pure function — no I/O. Field-level errors are returned in a flat
 * array; callers decide how to format them for HTTP responses.
 */
export function parseMcpServerInput(raw: unknown): ValidateResult {
  const errors: Array<ValidationError> = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ path: '', message: 'payload must be an object' }] }
  }
  const r = raw as Record<string, unknown>

  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name) {
    errors.push({ path: 'name', message: 'name is required' })
  }

  const VALID_TRANSPORTS = new Set(['http', 'stdio'])
  const transportRaw = r.transportType
  if (typeof transportRaw !== 'string' || !VALID_TRANSPORTS.has(transportRaw)) {
    errors.push({ path: 'transportType', message: 'unsupported transport' })
    // Cannot validate transport-specific fields without a known transport
    if (errors.length > 0) return { ok: false, errors }
  }
  const transport = transportRaw as 'http' | 'stdio'
  const out: McpServerInput = { name, transportType: transport }

  if (typeof r.enabled === 'boolean') out.enabled = r.enabled

  if (typeof r.url === 'string') out.url = r.url.trim()
  if (typeof r.command === 'string') out.command = r.command.trim()
  if (Array.isArray(r.args)) out.args = r.args.map((a) => String(a))

  // Transport-specific validation
  if (transport === 'http') {
    if (!out.url) {
      errors.push({ path: 'url', message: 'url is required for http transport' })
    } else if (!isHttpsLikeUrl(out.url)) {
      errors.push({ path: 'url', message: 'url must be http(s)' })
    }
    if (out.command) {
      errors.push({ path: 'command', message: 'command is not allowed for http transport' })
    }
    if (out.args) {
      errors.push({ path: 'args', message: 'args is not allowed for http transport' })
    }
  } else {
    // stdio
    if (!out.command) {
      errors.push({ path: 'command', message: 'command is required for stdio transport' })
    }
    if (!out.args) {
      errors.push({ path: 'args', message: 'args is required for stdio transport' })
    }
    if (out.url) {
      errors.push({ path: 'url', message: 'url is not allowed for stdio transport' })
    }
  }

  if (r.env && typeof r.env === 'object' && !Array.isArray(r.env)) {
    const envEntries = Object.entries(r.env as Record<string, unknown>)
    const env: Record<string, string> = {}
    for (const [k, v] of envEntries) {
      if (!ENV_KEY_RE.test(k)) {
        errors.push({ path: `env.${k}`, message: 'env keys must match /^[A-Z][A-Z0-9_]*$/' })
        continue
      }
      env[k] = String(v ?? '')
    }
    out.env = env
  }

  if (r.headers && typeof r.headers === 'object' && !Array.isArray(r.headers)) {
    out.headers = Object.fromEntries(
      Object.entries(r.headers as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
    )
  }

  if (r.authType === 'bearer' || r.authType === 'oauth' || r.authType === 'none') {
    out.authType = r.authType
  }
  if (typeof r.bearerToken === 'string') out.bearerToken = r.bearerToken
  if (r.oauth && typeof r.oauth === 'object') {
    const o = r.oauth as Record<string, unknown>
    if (typeof o.clientId === 'string' && typeof o.clientSecret === 'string') {
      out.oauth = {
        clientId: o.clientId,
        clientSecret: o.clientSecret,
        authorizationUrl: typeof o.authorizationUrl === 'string' ? o.authorizationUrl : undefined,
        tokenUrl: typeof o.tokenUrl === 'string' ? o.tokenUrl : undefined,
        scopes: Array.isArray(o.scopes) ? (o.scopes as Array<string>) : undefined,
      }
    }
  }
  if (r.toolMode === 'all' || r.toolMode === 'include' || r.toolMode === 'exclude') {
    out.toolMode = r.toolMode
  }
  if (Array.isArray(r.includeTools)) {
    out.includeTools = (r.includeTools as Array<unknown>).map((t) => String(t))
  }
  if (Array.isArray(r.excludeTools)) {
    out.excludeTools = (r.excludeTools as Array<unknown>).map((t) => String(t))
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true, value: out }
}
