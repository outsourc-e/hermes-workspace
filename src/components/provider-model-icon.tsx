'use client'

/**
 * ProviderModelIcon
 * Renders the official branded icon for an AI provider.
 * Uses @lobehub/icons for real provider logos.
 */

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

type ProviderModelIconProps = {
  /** Full model string e.g. "anthropic/claude-sonnet-4-6" or just "claude-sonnet-4-6" */
  model: string
  size?: number
  className?: string
  style?: CSSProperties
  /** Use themed variant (works on both light + dark) */
  themed?: boolean
}

function detectProvider(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('anthropic') || m.includes('claude')) return 'anthropic'
  if (
    m.includes('openai') ||
    m.includes('gpt') ||
    m.includes('codex') ||
    m.includes('o1') ||
    m.includes('o3')
  )
    return 'openai'
  if (m.includes('google') || m.includes('gemini') || m.includes('antigravity'))
    return 'google'
  if (m.includes('minimax')) return 'minimax'
  if (m.includes('mistral') || m.includes('devstral')) return 'mistral'
  if (m.includes('deepseek')) return 'deepseek'
  if (
    m.includes('ollama') ||
    m.includes('qwen') ||
    m.includes('llama') ||
    m.includes('pc1') ||
    m.includes('pc2')
  )
    return 'ollama'
  if (m.includes('openrouter')) return 'openrouter'
  if (m.includes('nvidia') || m.includes('nemotron')) return 'nvidia'
  return 'unknown'
}

export function ProviderModelIcon({
  model,
  size = 12,
  className,
  style,
}: ProviderModelIconProps) {
  const provider = detectProvider(model)

  // Use light variant (dark logos on transparent) for light mode
  // dark variant (white logos) for dark mode — toggled via CSS filter in dark mode
  const cdnBase = `https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png/light`

  const iconMap: Record<string, string> = {
    anthropic: `${cdnBase}/anthropic.png`,
    openai: `${cdnBase}/openai.png`,
    google: `${cdnBase}/google.png`,
    minimax: `${cdnBase}/minimax.png`,
    mistral: `${cdnBase}/mistral.png`,
    deepseek: `${cdnBase}/deepseek.png`,
    ollama: `${cdnBase}/ollama.png`,
    openrouter: `${cdnBase}/openrouter.png`,
    nvidia: `${cdnBase}/nvidia.png`,
  }

  const src = iconMap[provider]

  if (!src) {
    // Fallback: first letter of provider
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-sm bg-primary-200 text-primary-600 font-mono font-bold',
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.6, ...style }}
      >
        {provider[0]?.toUpperCase() ?? '?'}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={provider}
      width={size}
      height={size}
      className={cn('inline-block object-contain dark:invert', className)}
      style={{ width: size, height: size, ...style }}
      onError={(e) => {
        // If CDN fails, hide gracefully
        ;(e.target as HTMLImageElement).style.display = 'none'
      }}
    />
  )
}
