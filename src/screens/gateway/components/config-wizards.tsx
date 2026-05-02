'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TeamMember, TeamTemplateId } from './team-panel'
import { TEAM_TEMPLATES } from './team-panel'

// ─── Provider metadata ────────────────────────────────────────────────────────

/** SimpleIcons slug for each provider key (used for CDN logos).
 *  Only include providers confirmed to exist in simpleicons.org slugs.
 *  Providers NOT in SimpleIcons (deepseek, minimax, fireworks, togetherai) fall back to custom SVG. */
const SIMPLEICONS_SLUGS: Record<string, string> = {
  anthropic:            'anthropic',
  openai:               'openai',
  'openai-codex':       'openai',
  'github-copilot':     'githubcopilot',
  google:               'google',
  'google-antigravity': 'google',
  mistral:              'mistral',
  groq:                 'groq',
  ollama:               'ollama',
  perplexity:           'perplexity',
  cohere:               'cohere',
  xai:                  'x',
  openrouter:           'openrouter',
}

/** Branded hex color per provider (passed to simpleicons CDN for colored SVGs). */
const PROVIDER_HEX: Record<string, string> = {
  anthropic:          'D97757',
  openai:             '000000',   // OpenAI brand is now black/white
  'openai-codex':     '000000',
  'github-copilot':   '6E40C9',
  google:             '4285F4',
  'google-antigravity': '4285F4',
  mistral:            'FF7000',
  groq:               'F55036',
  ollama:             '000000',
  perplexity:         '20808D',
  cohere:             '39594D',
  xai:                '000000',
  openrouter:         '6467F2',
}

export const PROVIDER_META: Record<string, {
  label: string
  emoji: string
  color: string
  bg: string
  border: string
  description: string
}> = {
  anthropic:          { label: 'Anthropic',       emoji: '🟠', color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/20',   border: 'border-orange-300',   description: 'Claude models' },
  openai:             { label: 'OpenAI',           emoji: '🟢', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300',  description: 'GPT & o-series' },
  'openai-codex':     { label: 'OpenAI Codex',     emoji: '🟢', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300',  description: 'Codex models' },
  'github-copilot':   { label: 'GitHub Copilot',   emoji: '⚫', color: 'text-neutral-700 dark:text-neutral-300', bg: 'bg-neutral-100 dark:bg-neutral-800',   border: 'border-neutral-400',  description: 'Copilot via GitHub' },
  google:             { label: 'Google',           emoji: '🔵', color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20',       border: 'border-blue-300',     description: 'Gemini models' },
  'google-antigravity': { label: 'Google AG',      emoji: '🔵', color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20',       border: 'border-blue-300',     description: 'Gemini experimental' },
  deepseek:           { label: 'DeepSeek',         emoji: '🐋', color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-900/20',         border: 'border-sky-300',      description: 'DeepSeek R-series' },
  minimax:            { label: 'MiniMax',          emoji: '🟣', color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-50 dark:bg-violet-900/20',   border: 'border-violet-300',   description: 'M-series models' },
  openrouter:         { label: 'OpenRouter',       emoji: '🌐', color: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-50 dark:bg-indigo-900/20',   border: 'border-indigo-300',   description: 'Multi-provider routing' },
  mistral:            { label: 'Mistral',          emoji: '🔴', color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-900/20',       border: 'border-rose-300',     description: 'Mistral models' },
  xai:                { label: 'xAI',              emoji: '⚡', color: 'text-neutral-800 dark:text-neutral-100', bg: 'bg-neutral-100 dark:bg-neutral-800',   border: 'border-neutral-400',  description: 'Grok models' },
  groq:               { label: 'Groq',             emoji: '⚡', color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20',     border: 'border-amber-300',    description: 'Ultra-fast inference' },
  ollama:             { label: 'Ollama',           emoji: '🦙', color: 'text-teal-600 dark:text-teal-400',       bg: 'bg-teal-50 dark:bg-teal-900/20',       border: 'border-teal-300',     description: 'Local models' },
  together:           { label: 'Together AI',      emoji: '🤝', color: 'text-pink-600 dark:text-pink-400',       bg: 'bg-pink-50 dark:bg-pink-900/20',       border: 'border-pink-300',     description: 'Together inference' },
  fireworks:          { label: 'Fireworks',        emoji: '🎆', color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/20',   border: 'border-orange-300',   description: 'Fast open models' },
  perplexity:         { label: 'Perplexity',       emoji: '🔮', color: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-900/20',   border: 'border-purple-300',   description: 'Search-augmented AI' },
  cohere:             { label: 'Cohere',           emoji: '🌊', color: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-50 dark:bg-cyan-900/20',       border: 'border-cyan-300',     description: 'Command R series' },
}

export function getProviderMeta(provider: string) {
  const key = provider.toLowerCase()
  return PROVIDER_META[key] ?? {
    label: provider,
    emoji: '🔑',
    color: 'text-neutral-600 dark:text-neutral-400',
    bg: 'bg-neutral-100 dark:bg-neutral-800',
    border: 'border-neutral-300',
    description: 'Custom provider',
  }
}

// ─── Provider Logo component ──────────────────────────────────────────────────

/**
 * Renders the real provider logo from SimpleIcons CDN.
 * Falls back to the emoji if the image fails to load or no slug is known.
 */
export function ProviderLogo({ provider, size = 28 }: { provider: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const rawKey = provider.toLowerCase()
  // Normalize: exact match first, then try known slug prefixes (handles "ollama-pc1" → "ollama")
  const key = SIMPLEICONS_SLUGS[rawKey]
    ? rawKey
    : (Object.keys(SIMPLEICONS_SLUGS).find((k) => rawKey.startsWith(`${k}-`) || rawKey.startsWith(`${k}:`)) ?? rawKey)
  const meta = getProviderMeta(provider)
  const slug = SIMPLEICONS_SLUGS[key]
  const hex = PROVIDER_HEX[key]

  // Inline SVG for OpenAI — CDN unreliable for dark-brand providers; render crisp inline SVG instead
  if (key === 'openai' || key === 'openai-codex' || key === 'anthropic-oauth') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className="text-neutral-800 dark:text-white"
        aria-label={meta.label}
      >
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 11.44.525a5.985 5.985 0 0 0-5.708 4.17 6.046 6.046 0 0 0-4.039 2.916 6.046 6.046 0 0 0 .745 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.516 2.9A5.985 5.985 0 0 0 12.56 23.48a5.985 5.985 0 0 0 5.708-4.17 6.046 6.046 0 0 0 4.039-2.916 6.046 6.046 0 0 0-.025-7.573zM12.56 21.9a4.52 4.52 0 0 1-2.897-1.056l.143-.081 4.806-2.776a.795.795 0 0 0 .397-.689v-6.787l2.032 1.173a.071.071 0 0 1 .038.052v5.614a4.524 4.524 0 0 1-4.52 4.57zm-9.715-4.154a4.52 4.52 0 0 1-.54-3.03l.142.085 4.807 2.776a.793.793 0 0 0 .794 0l5.864-3.388v2.344a.072.072 0 0 1-.03.056L8.68 19.733a4.52 4.52 0 0 1-5.835-1.987zm-1.265-10.51a4.52 4.52 0 0 1 2.36-1.986V9.07a.77.77 0 0 0 .396.68l5.864 3.387-2.033 1.174a.072.072 0 0 1-.066 0L3.44 11.507a4.518 4.518 0 0 1-.86-4.271zm16.697 3.855-5.864-3.387 2.032-1.173a.072.072 0 0 1 .066 0l4.823 2.786a4.52 4.52 0 0 1-.706 8.156v-5.27a.795.795 0 0 0-.351-.612zm2.022-3.017-.143-.085-4.806-2.776a.795.795 0 0 0-.795 0L9.57 8.517V6.173a.072.072 0 0 1 .03-.057l4.83-2.786a4.52 4.52 0 0 1 6.585 4.685zm-12.64 4.135-2.032-1.174a.072.072 0 0 1-.038-.053V9.285a4.52 4.52 0 0 1 7.415-3.473l-.143.082L9.17 8.67a.795.795 0 0 0-.398.69zm1.103-2.378 2.607-1.506 2.607 1.506v3.012l-2.607 1.506-2.607-1.506V11.83z" />
      </svg>
    )
  }

  if (!failed && slug) {
    const brandHex = hex ?? '555555'
    // For very dark brand colors, show a white version in dark mode
    const isDarkBrand = parseInt(brandHex.slice(0, 2), 16) + parseInt(brandHex.slice(2, 4), 16) + parseInt(brandHex.slice(4, 6), 16) < 120
    const srcLight = `https://cdn.simpleicons.org/${slug}/${brandHex}`
    const srcDark  = `https://cdn.simpleicons.org/${slug}/ffffff`
    return (
      <>
        {/* Light mode version (brand color) */}
        <img
          src={srcLight}
          alt={meta.label}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ width: size, height: size, objectFit: 'contain' }}
          className={cn('object-contain', isDarkBrand ? 'block dark:hidden' : '')}
          draggable={false}
        />
        {/* Dark mode version (white) — only rendered for dark brand colors */}
        {isDarkBrand ? (
          <img
            src={srcDark}
            alt=""
            aria-hidden
            width={size}
            height={size}
            onError={() => setFailed(true)}
            style={{ width: size, height: size, objectFit: 'contain' }}
            className="hidden dark:block object-contain"
            draggable={false}
          />
        ) : null}
      </>
    )
  }

  // Custom emoji for providers not in SimpleIcons (or as CDN fallback)
  const CUSTOM_PROVIDER_ICONS: Record<string, string> = {
    deepseek:   '🐋',
    minimax:    '⚡',
    fireworks:  '🎆',
    together:   '🤝',
    togetherai: '🤝',
    ollama:     '🦙',
  }
  const customEmoji = CUSTOM_PROVIDER_ICONS[key]
  if (customEmoji) {
    return <span className="leading-none" style={{ fontSize: size * 0.55 }}>{customEmoji}</span>
  }

  // Fallback: branded letter abbreviation — prefer display label over raw provider string
  const labelSource = meta.label?.length > 1 ? meta.label : provider.replace(/[-_.]/g, ' ').trim()
  const letters = labelSource.replace(/\s+/g, '').slice(0, 2).toUpperCase()
  return (
    <span className={cn('font-black leading-none', meta.color)} style={{ fontSize: Math.max(10, size * 0.4) }}>
      {letters}
    </span>
  )
}

// ─── Common models per provider (shown when gateway hasn't loaded models yet) ─

export const PROVIDER_COMMON_MODELS: Record<string, Array<{ value: string; label: string }>> = {
  anthropic: [
    { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'anthropic/claude-haiku-3-5', label: 'Claude Haiku 3.5' },
  ],
  openai: [
    { value: 'openai/gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'openai/gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'openai/o3-mini', label: 'o3-mini' },
    { value: 'openai/o1', label: 'o1' },
  ],
  'openai-codex': [
    { value: 'openai/gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'openai/gpt-5.1-codex', label: 'GPT-5.1 Codex' },
    { value: 'openai/gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  ],
  google: [
    { value: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'google/gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
  'google-antigravity': [
    { value: 'google-antigravity/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'google-antigravity/gemini-2.5-flash-thinking', label: 'Gemini 2.5 Flash (Thinking)' },
  ],
  deepseek: [
    { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
    { value: 'deepseek/deepseek-v3', label: 'DeepSeek V3' },
    { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
  ],
  mistral: [
    { value: 'mistral/mistral-large', label: 'Mistral Large' },
    { value: 'mistral/mistral-small', label: 'Mistral Small' },
    { value: 'mistral/codestral', label: 'Codestral' },
    { value: 'mistral/mixtral-8x7b', label: 'Mixtral 8x7B' },
  ],
  groq: [
    { value: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { value: 'groq/llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
    { value: 'groq/mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
  ],
  cohere: [
    { value: 'cohere/command-r-plus', label: 'Command R+' },
    { value: 'cohere/command-r', label: 'Command R' },
    { value: 'cohere/command-light', label: 'Command Light' },
  ],
  perplexity: [
    { value: 'perplexity/sonar-pro', label: 'Sonar Pro' },
    { value: 'perplexity/sonar', label: 'Sonar' },
    { value: 'perplexity/sonar-reasoning', label: 'Sonar Reasoning' },
  ],
  together: [
    { value: 'together/meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
    { value: 'together/mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B' },
    { value: 'together/Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B' },
  ],
  fireworks: [
    { value: 'fireworks/accounts/fireworks/models/llama-v3p1-70b-instruct', label: 'Llama 3.1 70B' },
    { value: 'fireworks/accounts/fireworks/models/deepseek-r1', label: 'DeepSeek R1' },
    { value: 'fireworks/accounts/fireworks/models/qwen2p5-72b-instruct', label: 'Qwen 2.5 72B' },
  ],
  minimax: [
    { value: 'minimax/MiniMax-M2.7', label: 'MiniMax M2.7' },
    { value: 'minimax/MiniMax-M2.7-Lightning', label: 'MiniMax M2.7 Lightning' },
  ],
  xai: [
    { value: 'xai/grok-beta', label: 'Grok Beta' },
    { value: 'xai/grok-2', label: 'Grok 2' },
    { value: 'xai/grok-2-mini', label: 'Grok 2 Mini' },
  ],
  openrouter: [
    { value: 'openrouter/anthropic/claude-opus-4-6', label: 'Claude Opus 4.6 (OR)' },
    { value: 'openrouter/openai/gpt-4o', label: 'GPT-4o (OR)' },
    { value: 'openrouter/google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (OR)' },
  ],
  'github-copilot': [
    { value: 'github-copilot/gpt-4o', label: 'GPT-4o (Copilot)' },
    { value: 'github-copilot/o3-mini', label: 'o3-mini (Copilot)' },
    { value: 'github-copilot/claude-sonnet-4-5', label: 'Claude Sonnet (Copilot)' },
  ],
}

// ─── Shared Modal wrapper ─────────────────────────────────────────────────────

export function WizardModal({
  open,
  onClose,
  children,
  width = 'max-w-xl',
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop — clicking this closes the modal */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel — clicks inside stay inside */}
      <div
        className={cn(
          'relative w-full rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl',
          'max-h-[90vh] overflow-y-auto',
          width,
        )}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{children}</span>
}

const INPUT_CLS = 'h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-accent-400 focus:ring-1 transition-colors'
const SELECT_CLS = 'h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-accent-400 focus:ring-1'

// ─── AgentWizardModal ─────────────────────────────────────────────────────────

type AgentWizardProps = {
  member: TeamMember & { avatar?: number; backstory: string; roleDescription: string }
  memberIndex: number
  accentBorderClass: string
  /** Pre-rendered avatar node (includes the avatar + pencil button for changing it) */
  avatarNode: React.ReactNode
  gatewayModels: ReadonlyArray<{ value: string; label: string; provider: string }>
  modelPresets: ReadonlyArray<{ readonly id: string; readonly label: string; readonly desc?: string }>
  systemPromptTemplates: Array<{ id: string; label: string; icon: string; category: string; prompt: string }>
  /** When true: "Done" → "Add Agent", "Remove Agent" → "Cancel". onClose acts as the add/confirm action. */
  addMode?: boolean
  onUpdate: (updates: Partial<TeamMember & { avatar?: number; backstory: string; roleDescription: string }>) => void
  onDelete: () => void
  onClose: () => void
}

export function AgentWizardModal({
  member,
  memberIndex,
  accentBorderClass,
  avatarNode,
  gatewayModels,
  modelPresets,
  systemPromptTemplates,
  addMode = false,
  onUpdate,
  onDelete,
  onClose,
}: AgentWizardProps) {
  const isCustomPrompt = member.backstory.trim() !== '' && !systemPromptTemplates.some((t) => t.prompt === member.backstory)
  const headerSubtitle = member.roleDescription?.trim() || 'Configure your agent'
  const systemPromptRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea whenever backstory changes (e.g. template selected)
  useEffect(() => {
    const el = systemPromptRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`
  }, [member.backstory])

  return (
    <WizardModal open onClose={onClose} width="max-w-2xl">
      {/* Header */}
      <div className={cn('flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4', accentBorderClass)}>
        {/* Avatar slot (rendered by parent to avoid circular import) */}
        {avatarNode}
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-neutral-900 dark:text-white">{member.name || `Agent ${memberIndex + 1}`}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{headerSubtitle}</p>
        </div>
        <button type="button" onClick={onClose}
          className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Form body */}
      <div className="px-6 py-5 space-y-4">
        {/* Row 1: NAME (full width, prominent) */}
        <div>
          <FieldLabel>Name</FieldLabel>
          <input
            value={member.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 px-3 text-base font-semibold text-neutral-900 dark:text-white outline-none ring-accent-400 focus:ring-1 transition-colors"
            placeholder={`Agent ${memberIndex + 1}`}
          />
        </div>

        {/* Row 2: MODEL (half) + ROLE (half) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Model</FieldLabel>
            <select value={member.modelId} onChange={(e) => onUpdate({ modelId: e.target.value })} className={SELECT_CLS}>
              <optgroup label="Presets">
                {modelPresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </optgroup>
              {gatewayModels.length > 0 ? (
                <optgroup label="Available Models">
                  {gatewayModels.map((m) => <option key={m.value} value={m.value}>{m.label} ({m.provider})</option>)}
                </optgroup>
              ) : null}
            </select>
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <input value={member.roleDescription} onChange={(e) => onUpdate({ roleDescription: e.target.value })} className={INPUT_CLS} />
          </div>
        </div>

        {/* Row 3: Memory Path + Skill Allowlist */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Memory Path <span className="text-[9px] text-neutral-400 font-normal">(optional)</span></FieldLabel>
            <input
              value={member.memoryPath ?? ''}
              onChange={(e) => onUpdate({ memoryPath: e.target.value || undefined } as Partial<typeof member>)}
              className={INPUT_CLS}
              placeholder="e.g. ~/workspace/agent-memory"
            />
            <p className="mt-0.5 text-[9px] text-neutral-400">Custom memory/workspace directory for this agent</p>
          </div>
          <div>
            <FieldLabel>Skill Allowlist <span className="text-[9px] text-neutral-400 font-normal">(optional)</span></FieldLabel>
            <input
              value={(member.skillAllowlist ?? []).join(', ')}
              onChange={(e) => {
                const skills = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)
                onUpdate({ skillAllowlist: skills.length > 0 ? skills : undefined } as Partial<typeof member>)
              }}
              className={INPUT_CLS}
              placeholder="web_search, exec, read, write"
            />
            <p className="mt-0.5 text-[9px] text-neutral-400">Comma-separated skill names. Empty = all skills allowed.</p>
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel>System Prompt</FieldLabel>
            <div className="flex gap-1.5">
              <span className={cn('rounded-md border px-1.5 py-0.5 text-[9px] font-semibold',
                isCustomPrompt ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-400'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-400')}>
                {isCustomPrompt ? '✏️ Custom' : 'Template'}
              </span>
              {member.backstory.trim() ? (
                <button type="button" onClick={() => onUpdate({ backstory: '' })}
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-400 hover:text-red-500 transition-colors">
                  ✕ Clear
                </button>
              ) : null}
            </div>
          </div>

          {/* Template chips by category — compact */}
          <div className="space-y-1.5">
            {(['engineering', 'research', 'content', 'ops', 'general'] as const).map((cat) => {
              const catTemplates = systemPromptTemplates.filter((t) => t.category === cat)
              const catLabels: Record<string, string> = { engineering: '⚙️', research: '🔬', content: '📝', ops: '🗺️', general: '🤖' }
              return (
                <div key={cat} className="flex flex-wrap items-center gap-1">
                  <span className="shrink-0 w-6 text-center text-[9px]">{catLabels[cat]}</span>
                  {catTemplates.map((tpl) => {
                    const active = member.backstory === tpl.prompt
                    return (
                      <button key={tpl.id} type="button"
                        onClick={() => { onUpdate({ backstory: active ? '' : tpl.prompt }) }}
                        className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors gap-1',
                          active ? 'border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-700 dark:bg-accent-900/20 dark:text-accent-400'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700')}
                        title={tpl.prompt.slice(0, 120)}
                      >
                        {tpl.icon} {tpl.label}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <textarea
            ref={systemPromptRef}
            value={member.backstory}
            onChange={(e) => { onUpdate({ backstory: e.target.value }) }}
            className="mt-2 w-full resize-none rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 px-3 py-2.5 text-xs text-neutral-900 dark:text-white outline-none ring-accent-400 focus:ring-1 font-mono leading-relaxed overflow-auto"
            style={{ minHeight: 100, maxHeight: 400 }}
            placeholder="Persona, instructions, and context for this agent..."
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
        <button
          type="button"
          onClick={onDelete}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
            addMode
              ? 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              : 'border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
          )}
        >
          {addMode ? null : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          {addMode ? 'Cancel' : 'Remove Agent'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-600 transition-colors"
        >
          {addMode ? '+ Add Agent' : 'Save Changes'}
        </button>
      </div>
    </WizardModal>
  )
}

// ─── Team icon picker ─────────────────────────────────────────────────────────

const TEAM_ICONS = [
  '👥', '🚀', '⚡', '🔥', '🎯', '💡', '🛡️', '⚙️', '🔬', '📊',
  '🎨', '🏗️', '🧠', '💼', '🦾', '🌐', '🏆', '✨', '🤖', '🔐',
  '🧩', '🎓', '💪', '🌟', '🦅', '🎭', '🧬', '📡', '🏋️', '🌊',
  '🎪', '🔭', '💎', '🌈', '🐉', '🦁', '🐺', '🦊', '🐝', '🦋',
]

function TeamIconPicker({
  currentIcon,
  onSelect,
  onClose,
}: {
  currentIcon: string
  onSelect: (icon: string) => void
  onClose: () => void
}) {
  return (
    <div className="absolute left-0 top-full mt-1 z-[60] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-2 w-52">
      <div className="grid grid-cols-8 gap-0.5">
        {TEAM_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => { onSelect(icon); onClose() }}
            className={cn(
              'flex size-7 items-center justify-center rounded-md text-base transition-all hover:bg-accent-50 dark:hover:bg-accent-900/20 hover:scale-110',
              currentIcon === icon ? 'bg-accent-50 dark:bg-accent-900/20 ring-1 ring-accent-400' : '',
            )}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── TeamWizardModal (edit existing team) ────────────────────────────────────

type TeamWizardProps = {
  teamId: string
  teamName: string
  teamIcon: string
  teamDescription?: string
  teamMembers: Array<{ id: string; name: string; modelId: string }>
  availableAgents: Array<{ id: string; name: string; role: string }>
  isActive: boolean
  modelPresets: ReadonlyArray<{ readonly id: string; readonly label: string; readonly desc?: string }>
  gatewayModels: ReadonlyArray<{ value: string; label: string; provider: string }>
  onRename: (name: string) => void
  onUpdateIcon: (icon: string) => void
  onUpdateDescription: (desc: string) => void
  onUpdateMembers: (members: Array<{ id: string; name: string; modelId: string }>) => void
  onLoad: () => void
  onDelete: () => void
  onClose: () => void
}

export function TeamWizardModal({
  teamId: _teamId,
  teamName,
  teamIcon,
  teamDescription,
  teamMembers,
  availableAgents,
  isActive,
  modelPresets: _modelPresets,
  gatewayModels: _gatewayModels,
  onRename,
  onUpdateIcon,
  onUpdateDescription,
  onUpdateMembers,
  onLoad,
  onDelete,
  onClose,
}: TeamWizardProps) {
  const [name, setName] = useState(teamName)
  const [icon, setIcon] = useState(teamIcon || '👥')
  const [description, setDescription] = useState(teamDescription ?? '')
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [localMembers, setLocalMembers] = useState(teamMembers.map((m) => ({ ...m })))

  const accentBorder = isActive ? 'border-accent-400' : 'border-blue-400'
  const notInTeam = availableAgents.filter((a) => !localMembers.some((m) => m.id === a.id))

  function handleSave() {
    onRename(name)
    onUpdateIcon(icon)
    onUpdateDescription(description)
    onUpdateMembers(localMembers)
    onClose()
  }

  function removeAgent(id: string) {
    setLocalMembers((prev) => prev.filter((m) => m.id !== id))
  }

  function addAgent(agentId: string) {
    const agent = availableAgents.find((a) => a.id === agentId)
    if (agent) {
      setLocalMembers((prev) => [...prev, { id: agent.id, name: agent.name, modelId: 'auto' }])
    }
  }

  return (
    <WizardModal open onClose={onClose} width="max-w-lg">
      {/* Header */}
      <div className={cn('flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4', accentBorder)}>
        {/* Team icon with pencil */}
        <div className="relative shrink-0">
          <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-3xl shadow-sm">
            {icon}
          </div>
          <button
            type="button"
            onClick={() => setShowIconPicker((v) => !v)}
            className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-white dark:border-neutral-900 bg-neutral-700 text-white shadow-md hover:bg-neutral-600 transition-colors"
            title="Change icon"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {showIconPicker ? (
            <TeamIconPicker
              currentIcon={icon}
              onSelect={(newIcon) => { setIcon(newIcon); setShowIconPicker(false) }}
              onClose={() => setShowIconPicker(false)}
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-neutral-900 dark:text-white">{name || 'Untitled Team'}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{localMembers.length} agent{localMembers.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Star — active team toggle */}
        <button
          type="button"
          onClick={() => { if (!isActive) { onLoad(); onClose() } }}
          title={isActive ? 'Active team' : 'Set as active team'}
          className={cn('text-2xl leading-none transition-colors mr-1', isActive ? 'text-accent-400 cursor-default' : 'text-neutral-300 hover:text-accent-400 cursor-pointer')}
        >
          {isActive ? '⭐' : '☆'}
        </button>

        <button type="button" onClick={onClose}
          className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Team name */}
        <div>
          <FieldLabel>Team Name</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
        </div>

        {/* Specialty */}
        <div>
          <FieldLabel>Specialty</FieldLabel>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this team best at? e.g. Deep research & analysis"
            className={INPUT_CLS}
          />
        </div>

        {/* Section A: current team members */}
        <div>
          <FieldLabel>TEAM ({localMembers.length} agent{localMembers.length !== 1 ? 's' : ''})</FieldLabel>
          <div className="space-y-1.5">
            {localMembers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 py-3 text-center text-xs text-neutral-400">No agents yet — add some below</p>
            ) : localMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-100 dark:bg-accent-900/30 text-[11px] font-bold text-accent-600 dark:text-accent-400">
                  {member.name[0]?.toUpperCase() ?? '?'}
                </div>
                <p className="min-w-0 flex-1 text-xs font-semibold text-neutral-900 dark:text-white truncate">{member.name}</p>
                <button type="button" onClick={() => removeAgent(member.id)}
                  className="flex size-6 items-center justify-center rounded-full text-neutral-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors" title="Remove from team">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                </button>
              </div>
            ))}
          </div>
          {notInTeam.length > 0 && localMembers.length > 0 ? (
            <p className="mt-1 text-center text-[9px] text-neutral-400">↓ scroll to add more agents</p>
          ) : null}
        </div>

        {/* Section B: agents not in team */}
        {notInTeam.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-neutral-100 dark:bg-neutral-800" />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">Add Agents</span>
              <div className="flex-1 h-px bg-neutral-100 dark:bg-neutral-800" />
            </div>
            <div className="space-y-1.5">
              {notInTeam.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/10 px-3 py-2.5 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {agent.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-neutral-700 dark:text-neutral-200 font-medium">{agent.name}</p>
                    {agent.role ? <p className="text-[10px] text-neutral-400 truncate">{agent.role}</p> : null}
                  </div>
                  <button type="button" onClick={() => addAgent(agent.id)}
                    className="flex size-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors" title="Add to team">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/50 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Delete Team
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
        >
          ✓ Save
        </button>
      </div>
    </WizardModal>
  )
}

// ─── AddTeamModal ─────────────────────────────────────────────────────────────

/** Icons shown in the inline picker row inside the New Team wizard */
const INLINE_TEAM_ICONS = ['👥', '🚀', '⚡', '🔥', '🎯', '💡', '🛡️', '⚙️', '🔬', '📊', '🎨', '🏗️', '🧠', '💼', '🦾', '🌐', '🏆', '✨', '🤖', '🔐', '🧩', '🎓', '💎', '🌟', '🦅']

type AddTeamModalProps = {
  currentTeam: Array<{ id: string; name: string; modelId: string }>
  quickStartTemplates: Array<{
    id: string; icon: string; label: string; description: string;
    tier: string; agents: string[]; templateId?: string
  }>
  /** Icons already in use by existing teams — new team will get a different one */
  existingIcons?: string[]
  /** Called with team name, icon, and the IDs of agents to include */
  onSaveCurrentAs: (name: string, icon: string, selectedAgentIds: string[]) => void
  onApplyTemplate: (templateId: TeamTemplateId) => void
  onClose: () => void
}

function pickUniqueTeamIcon(existing: string[]): string {
  const usedSet = new Set(existing)
  const available = INLINE_TEAM_ICONS.filter((ic) => !usedSet.has(ic))
  const pool = available.length > 0 ? available : INLINE_TEAM_ICONS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function AddTeamModal({ currentTeam, quickStartTemplates, existingIcons = [], onSaveCurrentAs, onApplyTemplate, onClose }: AddTeamModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    () => new Set(currentTeam.map((m) => m.id))
  )
  const [teamName, setTeamName] = useState('')
  const [teamIcon, setTeamIcon] = useState(() => pickUniqueTeamIcon(existingIcons))
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus name input when step 1 mounts
  useEffect(() => {
    if (step === 1) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [step])

  // Apply a template — pre-fill agents (and name only if blank or was template name)
  function applyTemplate(tpl: AddTeamModalProps['quickStartTemplates'][number] | null) {
    if (!tpl) {
      setSelectedAgents(new Set(currentTeam.map((m) => m.id)))
      return
    }
    const matched = new Set(
      currentTeam
        .filter((m) => tpl.agents.some((a) => a.toLowerCase() === m.name.toLowerCase()))
        .map((m) => m.id)
    )
    setSelectedAgents(matched.size > 0 ? matched : new Set(currentTeam.map((m) => m.id)))
  }

  function toggleAgent(id: string) {
    setSelectedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleCreate() {
    const name = teamName.trim() || `Custom Team ${new Date().toLocaleDateString()}`
    const agentIds = currentTeam.filter((m) => selectedAgents.has(m.id)).map((m) => m.id)
    if (selectedTemplate) {
      const tpl = quickStartTemplates.find((t) => t.id === selectedTemplate)
      if (tpl?.templateId && tpl.templateId in TEAM_TEMPLATES) {
        onApplyTemplate(tpl.templateId as TeamTemplateId)
      }
    }
    onSaveCurrentAs(name, teamIcon, agentIds)
    onClose()
  }

  const canCreate = selectedAgents.size > 0

  const stepLabel =
    step === 1 ? 'Step 1 of 3' :
    step === 2 ? 'Step 2 of 3' :
                 'Step 3 of 3'

  return (
    <WizardModal open onClose={onClose} width="max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4 border-l-accent-400">
        <div className="flex size-12 items-center justify-center rounded-full bg-accent-50 dark:bg-accent-900/20 text-2xl shadow-sm">
          {teamIcon}
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-neutral-900 dark:text-white">New Team</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{stepLabel}</p>
        </div>
        {/* Step dots */}
        <div className="flex items-center gap-1.5 mr-2">
          <span className={cn('size-2 rounded-full transition-colors', step === 1 ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
          <span className={cn('size-2 rounded-full transition-colors', step === 2 ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
          <span className={cn('size-2 rounded-full transition-colors', step === 3 ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
        </div>
        <button type="button" onClick={onClose}
          className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* ── Step 1: Name your team ── */}
      {step === 1 ? (
        <>
          <div className="px-6 py-8">
            <p className="mb-5 text-xl font-bold text-neutral-900 dark:text-white">Name your team</p>
            <input
              ref={nameInputRef}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && teamName.trim() && !e.nativeEvent.isComposing) setStep(2) }}
              placeholder="e.g. Research Squad, Dev Team..."
              className="h-11 w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 text-sm text-neutral-900 dark:text-white outline-none ring-accent-400 focus:ring-2 transition-colors"
            />
            <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">You can change this later</p>
          </div>
          <div className="flex justify-end border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!teamName.trim()}
              className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        </>
      ) : null}

      {/* ── Step 2: Choose a picture ── */}
      {step === 2 ? (
        <>
          <div className="px-6 py-6">
            <p className="mb-4 text-xl font-bold text-neutral-900 dark:text-white">Choose a picture</p>
            <div className="grid grid-cols-6 gap-2">
              {INLINE_TEAM_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setTeamIcon(ic)}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-xl text-2xl transition-all hover:scale-110',
                    teamIcon === ic
                      ? 'bg-accent-100 dark:bg-accent-900/40 ring-2 ring-accent-400'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
            >
              Next →
            </button>
          </div>
        </>
      ) : null}

      {/* ── Step 3: Build your team ── */}
      {step === 3 ? (
        <>
          <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-4">
            {/* Templates section */}
            <div>
              <p className="mb-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Start from a template</p>
              <div className="grid grid-cols-2 gap-2">
                {quickStartTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      const next = tpl.id === selectedTemplate ? null : tpl.id
                      setSelectedTemplate(next)
                      applyTemplate(next ? tpl : null)
                    }}
                    className={cn('flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-left transition-all',
                      selectedTemplate === tpl.id
                        ? 'border-accent-400 bg-accent-50 dark:bg-accent-900/15 shadow-sm'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600')}
                  >
                    <span className="shrink-0 text-xl">{tpl.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100 truncate">{tpl.label}</p>
                      <p className="text-[9px] text-neutral-400 truncate mt-0.5">{tpl.description}</p>
                    </div>
                    <span className={cn('ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold',
                      tpl.tier === 'budget' ? 'bg-green-100 text-green-700' : tpl.tier === 'balanced' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>
                      {tpl.tier === 'budget' ? '💰' : tpl.tier === 'balanced' ? '⚖️' : '🚀'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 whitespace-nowrap">— or configure from scratch —</span>
              <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
            </div>

            {/* Agent checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <FieldLabel>Agents to Include</FieldLabel>
                <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                  {selectedAgents.size} of {currentTeam.length} selected
                </span>
              </div>
              <div className="space-y-1.5">
                {currentTeam.length === 0 ? (
                  <p className="text-center text-xs text-neutral-400 py-3">No agents configured yet</p>
                ) : currentTeam.map((m) => {
                  const checked = selectedAgents.has(m.id)
                  const modelParts = m.modelId.split('/')
                  const modelShort = modelParts[modelParts.length - 1] || m.modelId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAgent(m.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all',
                        checked
                          ? 'border-accent-300 bg-accent-50/50 dark:border-accent-700/50 dark:bg-accent-900/10'
                          : 'border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30 opacity-60 hover:opacity-80',
                      )}
                    >
                      <span className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border-2 transition-all',
                        checked ? 'border-accent-500 bg-accent-500' : 'border-neutral-300 dark:border-neutral-600',
                      )}>
                        {checked ? <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 truncate leading-tight">{m.name}</p>
                        <p className="text-[10px] text-neutral-400 truncate leading-tight mt-0.5">{m.modelId}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 dark:text-neutral-400">
                        {modelShort}
                      </span>
                    </button>
                  )
                })}
                {selectedAgents.size === 0 ? (
                  <p className="text-[10px] text-red-500 text-center pt-1">Select at least one agent</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50 transition-colors"
            >
              Create Team
            </button>
          </div>
        </>
      ) : null}
    </WizardModal>
  )
}

// ─── ProviderEditModal ────────────────────────────────────────────────────────

type ProviderEditModalProps = {
  provider: string
  currentModels: Array<{ value: string; label: string; provider: string }>
  availableModels: Array<{ value: string; label: string; provider: string }>
  onSave: (apiKey: string, defaultModel: string) => void
  onClose: () => void
  onDelete?: () => Promise<void>
}

export function ProviderEditModal({ provider, currentModels, availableModels, onSave, onClose, onDelete }: ProviderEditModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const meta = getProviderMeta(provider)

  return (
    <WizardModal open onClose={onClose} width="max-w-md">
      {/* Header — branded with provider logo + accent border */}
      <div className={cn('flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4', meta.border)}>
        <div className={cn('flex size-14 shrink-0 items-center justify-center rounded-full shadow-sm', meta.bg)}>
          <ProviderLogo provider={provider} size={32} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-neutral-900 dark:text-white">{meta.label}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{meta.description}</p>
          {currentModels.length > 0 ? (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {currentModels.length} model{currentModels.length !== 1 ? 's' : ''} active
              </span>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Current models list */}
        {currentModels.length > 0 ? (
          <div>
            <FieldLabel>Available Models</FieldLabel>
            <div className="rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 p-2 max-h-36 overflow-y-auto">
              {currentModels.map((m) => (
                <div key={m.value} className="flex items-center gap-2 px-1 py-1">
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Default model picker — gateway models first, then curated fallback */}
        {(() => {
          const key = provider.toLowerCase()
          const curated = PROVIDER_COMMON_MODELS[key] ?? []
          const combined = availableModels.length > 0 ? availableModels : curated
          if (combined.length === 0) return null
          return (
            <div>
              <FieldLabel>
                Default Model{' '}
                {availableModels.length === 0 ? (
                  <span className="font-normal normal-case text-neutral-300 dark:text-neutral-600">— common models</span>
                ) : null}
              </FieldLabel>
              <select value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} className={SELECT_CLS}>
                <option value="">Use gateway default</option>
                {combined.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )
        })()}

        {/* API key update */}
        <div>
          <FieldLabel>
            Update API Key{' '}
            <span className="font-normal normal-case text-neutral-300 dark:text-neutral-600">— leave blank to keep current</span>
          </FieldLabel>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="New API key…"
            className={cn(INPUT_CLS, 'font-mono')}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
        <div>
          {onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
            >
              Remove Provider
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onSave(apiKey, defaultModel); onClose() }}
            className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
          >
            Update Provider
          </button>
        </div>
      </div>
    </WizardModal>
  )
}
