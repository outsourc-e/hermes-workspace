/**
 * Placeholder detection helpers for MCP server templates.
 *
 * Shared by:
 *  - InstallConfirmationDialog (US-501): blocks install until placeholders filled
 *  - McpServerCard (US-502): shows hint when test fails and arg/url is a placeholder
 */
import type { McpClientInput } from '@/types/mcp'

export interface PlaceholderField {
  path: string
  currentValue: string
  kind: 'arg' | 'env' | 'url'
}

/** Matches bare angle-bracket tokens like <token>, <your-host>, <X>, <YOUR_VAR>. */
const ANGLE_BRACKET_RE = /^<[^>]+>$/

/** Key suffix pattern that indicates an auth/secret env var. */
const AUTH_ENV_KEY_RE = /(_TOKEN|_KEY|_SECRET|_AUTH|_APIKEY|_API_KEY)$/i

/** Returns true if a string looks like an unfilled placeholder. */
export function isArgPlaceholder(value: string): boolean {
  if (ANGLE_BRACKET_RE.test(value)) return true
  if (value.includes('/path/to/')) return true
  if (value.includes('/your/path')) return true
  return false
}

export function isUrlPlaceholder(value: string): boolean {
  if (value.includes('example.com')) return true
  if (value.includes('<your-host>')) return true
  // Substring angle-bracket match (e.g. https://<host>/mcp)
  if (/<[^>]+>/.test(value)) return true
  return false
}

export function isEnvPlaceholder(key: string, value: string): boolean {
  if (ANGLE_BRACKET_RE.test(value)) return true
  // Empty value for a secret-named key counts as placeholder
  if (value === '' && AUTH_ENV_KEY_RE.test(key)) return true
  return false
}

/**
 * Scan a McpClientInput template and return every placeholder field detected.
 */
export function detectPlaceholders(template: McpClientInput): Array<PlaceholderField> {
  const found: Array<PlaceholderField> = []

  // Check args[]
  if (template.args) {
    template.args.forEach((arg, i) => {
      if (isArgPlaceholder(arg)) {
        found.push({ path: `args[${i}]`, currentValue: arg, kind: 'arg' })
      }
    })
  }

  // Check env values
  if (template.env) {
    for (const [key, value] of Object.entries(template.env)) {
      if (isEnvPlaceholder(key, value)) {
        found.push({ path: `env.${key}`, currentValue: value, kind: 'env' })
      }
    }
  }

  // Check url
  if (template.url && isUrlPlaceholder(template.url)) {
    found.push({ path: 'url', currentValue: template.url, kind: 'url' })
  }

  return found
}

/**
 * Returns true if a value is still a placeholder (used to check filled overrides).
 */
export function isStillPlaceholder(kind: PlaceholderField['kind'], value: string): boolean {
  if (!value) return true
  if (kind === 'arg') return isArgPlaceholder(value)
  if (kind === 'url') return isUrlPlaceholder(value)
  if (kind === 'env') return ANGLE_BRACKET_RE.test(value)
  return false
}
