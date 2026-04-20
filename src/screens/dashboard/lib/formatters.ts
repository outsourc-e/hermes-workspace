/**
 * Canonical dashboard formatters — single source of truth.
 *
 * All dashboard screens and widgets must import from here.
 * Do NOT duplicate these in individual widget files.
 */

/**
 * Formats a raw model identifier into a human-readable name.
 *
 * Examples:
 *   "anthropic/claude-opus-4-6"  → "Opus 4.6"
 *   "anthropic/claude-sonnet-4-5" → "Sonnet 4.5"
 *   "openrouter/google/gemini-2.5-flash" → "Gemini 2.5 Flash"
 *   "openai/gpt-5.3-codex"       → "Codex 5.3"
 *   "delivery-mirror"            → "Mirror"
 *   "kimi-k2.5"                  → "Kimi K2.5"
 */
export function formatModelName(raw: string): string {
  if (!raw) return '—'

  // Strip provider prefix: "anthropic/claude-opus-4-6" → "claude-opus-4-6"
  // Handle nested paths like "openrouter/google/gemini-2.5-flash" → "gemini-2.5-flash"
  const stripped = raw.includes('/') ? (raw.split('/').pop() ?? raw) : raw
  const lower = stripped.toLowerCase()

  if (lower.includes('opus')) {
    const match = stripped.match(/opus[- _]?(\d+)[- _.]?(\d+)/i)
    return match ? `Opus ${match[1]}.${match[2]}` : 'Opus'
  }
  if (lower.includes('sonnet')) {
    const match = stripped.match(/sonnet[- _]?(\d+)[- _.]?(\d+)/i)
    return match ? `Sonnet ${match[1]}.${match[2]}` : 'Sonnet'
  }
  if (lower.includes('haiku')) {
    const match = stripped.match(/haiku[- _]?(\d+)[- _.]?(\d+)/i)
    return match ? `Haiku ${match[1]}.${match[2]}` : 'Haiku'
  }
  if (lower.includes('gemini')) {
    const match = stripped.match(
      /gemini[- _]?(\d+(?:[._]\d+)*)(?:[- _]?(flash|pro|ultra|exp))?/i,
    )
    if (match) {
      const version = match[1].replace(/[_]/g, '.')
      const variant = match[2]
        ? ` ${match[2].charAt(0).toUpperCase()}${match[2].slice(1)}`
        : ''
      return `Gemini ${version}${variant}`
    }
    return 'Gemini'
  }
  if (lower.includes('codex')) {
    // "gpt-5.3-codex" → "Codex 5.3"
    const match =
      stripped.match(/gpt[- _]?(\d+)[- _.]?(\d+)[- _]codex/i) ??
      stripped.match(/codex[- _]?(\d+)[- _.]?(\d+)/i)
    return match ? `Codex ${match[1]}.${match[2]}` : 'Codex'
  }
  if (lower.includes('gpt')) {
    const match = stripped.match(/gpt[- _]?(\d+)(?:[- _.]?(\d+))?/i)
    if (match) {
      return match[2] ? `GPT-${match[1]}.${match[2]}` : `GPT-${match[1]}`
    }
    return stripped.replace(/gpt-/gi, 'GPT-')
  }
  if (lower === 'delivery-mirror') return 'Mirror'
  if (lower.includes('kimi')) return 'Kimi K2.5'

  // Fallback: clean up dashes/underscores and title-case
  return stripped
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Formats a Unix ms timestamp as a relative time string.
 *
 * Examples:
 *   (now - 30s)   → "just now"
 *   (now - 2min)  → "2m ago"
 *   (now - 3h)    → "3h ago"
 *   (now - 2d)    → "2d ago"
 */
export function formatRelativeTime(timestampMs: number): string {
  if (!timestampMs || timestampMs <= 0) return 'just now'
  const diffMs = Math.max(0, Date.now() - timestampMs)
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Formats a USD dollar amount.
 *
 * Examples:
 *   102.93   → "$102.93"
 *   1234.56  → "$1,234.56"
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formats a token count compactly.
 *
 * Examples:
 *   4_700_000 → "4.7M"
 *   123_000   → "123.0K"
 *   456       → "456"
 */
export function formatTokens(count: number): string {
  const safe = Math.max(0, Math.round(count))
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat().format(safe)
}

/**
 * Formats a duration in seconds as a human-readable uptime string.
 *
 * Examples:
 *   0        → "—"
 *   30       → "< 1m"
 *   154      → "2m"
 *   9240     → "2h 34m"
 *   90000    → "1d 1h"
 */
export function formatUptime(seconds: number): string {
  if (seconds <= 0) return '—'
  if (seconds < 60) return '< 1m'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Formats a percentage value.
 *
 * Examples:
 *   47.3   → "47.3%"
 *   100    → "100%"
 *   0      → "0.0%"
 */
export function formatPercent(value: number): string {
  const clamped = Math.max(0, Math.min(100, value))
  if (clamped === 100) return '100%'
  if (clamped === 0) return '0%'
  return `${clamped.toFixed(1)}%`
}
