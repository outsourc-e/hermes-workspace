'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  CloudIcon,
  ComputerIcon,
  ArrowLeft01Icon,
  Moon01Icon,
  Notification03Icon,
  PaintBoardIcon,
  Sun01Icon,
  UserIcon,
  MessageMultiple01Icon,
} from '@hugeicons/core-free-icons'
import { useState, useEffect, Component } from 'react'
import type * as React from 'react'
import type { AccentColor, SettingsThemeMode } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { applyTheme, useSettings } from '@/hooks/use-settings'
import {
  THEMES,
  getTheme,
  getThemeVariant,
  isDarkTheme,
  setTheme,
  type ThemeId,
} from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  getChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import type { LoaderStyle } from '@/hooks/use-chat-settings'
import { UserAvatar } from '@/components/avatars'
import { Input } from '@/components/ui/input'
import { LogoLoader } from '@/components/logo-loader'
import { BrailleSpinner } from '@/components/ui/braille-spinner'
import type { BrailleSpinnerPreset } from '@/components/ui/braille-spinner'
import { ThreeDotsSpinner } from '@/components/ui/three-dots-spinner'
import { applyAccentColor } from '@/lib/accent-colors'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'

// ── Types ───────────────────────────────────────────────────────────────

type SectionId =
  | 'hermes'
  | 'appearance'
  | 'chat'
  | 'notifications'

const SECTIONS: Array<{ id: SectionId; label: string; icon: any }> = [
  { id: 'hermes', label: 'Hermes Agent', icon: CloudIcon },
  { id: 'appearance', label: 'Appearance', icon: PaintBoardIcon },
  { id: 'chat', label: 'Chat', icon: MessageMultiple01Icon },
  { id: 'notifications', label: 'Notifications', icon: Notification03Icon },
]

const DARK_ENTERPRISE_THEMES = new Set<ThemeId>([
  'hermes-official',
  'hermes-classic',
  'hermes-slate',
  'hermes-mono',
])

function _isDarkEnterpriseTheme(theme: string | null): theme is ThemeId {
  if (!theme) return false
  return DARK_ENTERPRISE_THEMES.has(theme as ThemeId)
}
void _isDarkEnterpriseTheme

// ── Shared building blocks ──────────────────────────────────────────────

function SectionHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="mb-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-500">
        Settings
      </p>
      <h3 className="text-base font-semibold text-primary-900 dark:text-neutral-100">
        {title}
      </h3>
      <p className="text-xs text-primary-500 dark:text-neutral-400">
        {description}
      </p>
    </div>
  )
}

function Row({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary-900 dark:text-neutral-100">
          {label}
        </p>
        {description && (
          <p className="text-xs text-primary-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

const SETTINGS_CARD_CLASS =
  'rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 shadow-sm'

// ── Section components ──────────────────────────────────────────────────

function HermesContent() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [providers, setProviders] = useState<Array<{id:string; name:string; envKeys:string[]; configured:boolean; maskedKeys:Record<string,string>}>>([])
  const [activeModel, setActiveModel] = useState('')
  const [activeProvider, setActiveProvider] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [providerInput, setProviderInput] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/hermes-config')
      .then((r) => r.json())
      .then((d: any) => {
        setConfig(d.config)
        setProviders(d.providers || [])
        setActiveModel(d.activeModel || '')
        setActiveProvider(d.activeProvider || '')
        setModelInput(d.activeModel || '')
        setProviderInput(d.activeProvider || '')
      })
      .catch(() => {})
  }, [])

  const save = async (updates: { config?: Record<string, unknown>; env?: Record<string, string> }) => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/hermes-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      const r = await res.json() as { message?: string }
      setMsg(r.message || 'Saved')
      // Refresh
      const ref = await fetch('/api/hermes-config')
      const d = await ref.json() as any
      setConfig(d.config); setProviders(d.providers || []); setActiveModel(d.activeModel || ''); setActiveProvider(d.activeProvider || '')
      setTimeout(() => setMsg(null), 3000)
    } catch { setMsg('Failed to save') }
    setSaving(false)
  }

  const memConfig = (config?.memory as Record<string, unknown>) || {}

  return (
    <div className="space-y-4">
      {msg && (
        <div className={cn('rounded-lg px-3 py-2 text-sm font-medium', msg.includes('Failed') ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400')}>
          {msg}
        </div>
      )}

      {/* Model */}
      <div className={SETTINGS_CARD_CLASS}>
        <h3 className="text-sm font-semibold text-primary-900 mb-2">Model & Provider</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-primary-500 w-16 shrink-0">Model</label>
            <input
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              className="flex-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-sm text-primary-900 outline-none focus:border-accent-500"
              placeholder="e.g. gpt-5.3-codex"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-primary-500 w-16 shrink-0">Provider</label>
            <input
              value={providerInput}
              onChange={(e) => setProviderInput(e.target.value)}
              className="flex-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-sm text-primary-900 outline-none focus:border-accent-500"
              placeholder="e.g. openai-codex"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ config: { model: { default: modelInput, provider: providerInput } } })}
              className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className={SETTINGS_CARD_CLASS}>
        <h3 className="text-sm font-semibold text-primary-900 mb-2">API Keys</h3>
        <p className="text-xs text-primary-500 mb-3">Stored in ~/.hermes/.env</p>
        <div className="space-y-2">
          {providers.filter((p) => p.envKeys.length > 0).map((provider) => (
            <div key={provider.id} className="flex items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <div className="text-sm font-medium text-primary-900">{provider.name}</div>
                <div className="text-xs text-primary-500">
                  {provider.configured ? '✅ Configured' : '❌ Not set'}
                  {provider.configured && provider.maskedKeys[provider.envKeys[0]] && (
                    <span className="ml-1 font-mono">{provider.maskedKeys[provider.envKeys[0]]}</span>
                  )}
                </div>
              </div>
              {editingKey === provider.envKeys[0] ? (
                <div className="flex items-center gap-1">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="w-48 rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-xs outline-none focus:border-accent-500"
                    placeholder={`Enter ${provider.envKeys[0]}`}
                  />
                  <button type="button" onClick={() => { save({ env: { [provider.envKeys[0]]: keyInput } }); setEditingKey(null); setKeyInput('') }} className="rounded bg-accent-500 px-2 py-1 text-xs text-white">Save</button>
                  <button type="button" onClick={() => { setEditingKey(null); setKeyInput('') }} className="rounded px-2 py-1 text-xs text-primary-500 hover:text-primary-900">✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditingKey(provider.envKeys[0]); setKeyInput('') }}
                  className="rounded-lg border border-primary-200 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                >
                  {provider.configured ? 'Change' : 'Add Key'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Memory */}
      <div className={SETTINGS_CARD_CLASS}>
        <h3 className="text-sm font-semibold text-primary-900 mb-2">Memory</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-primary-900">Memory enabled</div>
              <div className="text-xs text-primary-500">Store memories across sessions</div>
            </div>
            <button
              type="button"
              onClick={() => save({ config: { memory: { memory_enabled: !(memConfig.memory_enabled !== false) } } })}
              className={cn('rounded-full px-3 py-1 text-xs font-medium', memConfig.memory_enabled !== false ? 'bg-green-500/15 text-green-500' : 'bg-primary-200 text-primary-500')}
            >
              {memConfig.memory_enabled !== false ? 'On' : 'Off'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-primary-900">User profile</div>
              <div className="text-xs text-primary-500">Remember preferences</div>
            </div>
            <button
              type="button"
              onClick={() => save({ config: { memory: { user_profile_enabled: !(memConfig.user_profile_enabled !== false) } } })}
              className={cn('rounded-full px-3 py-1 text-xs font-medium', memConfig.user_profile_enabled !== false ? 'bg-green-500/15 text-green-500' : 'bg-primary-200 text-primary-500')}
            >
              {memConfig.user_profile_enabled !== false ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className={SETTINGS_CARD_CLASS}>
        <h3 className="text-sm font-semibold text-primary-900 mb-2">Runtime</h3>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-primary-500">Model</span><span className="font-mono text-primary-900">{activeModel}</span></div>
          <div className="flex justify-between"><span className="text-primary-500">Provider</span><span className="font-mono text-primary-900">{activeProvider}</span></div>
          <div className="flex justify-between"><span className="text-primary-500">Config</span><span className="font-mono text-primary-900">~/.hermes/config.yaml</span></div>
        </div>
      </div>
    </div>
  )
}

function ProfileContent() {
  const { settings: cs, updateSettings: updateCS } = useChatSettingsStore()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const displayName = getChatProfileDisplayName(cs.displayName)
  const [nameError, setNameError] = useState<string | null>(null)

  function handleNameChange(value: string) {
    if (value.length > 50) {
      setNameError('Display name too long (max 50 characters)')
      return
    }
    setNameError(null)
    updateCS({ displayName: value })
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileError('Unsupported file type.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setProfileError('Image too large (max 10MB).')
      return
    }
    setProfileError(null)
    setProcessing(true)
    try {
      const url = URL.createObjectURL(file)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('Failed'))
        i.src = url
      })
      const max = 128,
        scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale),
        h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      updateCS({
        avatarDataUrl: canvas.toDataURL(
          file.type === 'image/png' ? 'image/png' : 'image/jpeg',
          0.82,
        ),
      })
    } catch {
      setProfileError('Failed to process image.')
    } finally {
      setProcessing(false)
    }
  }

  const errorId = 'profile-name-error'

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Profile"
        description="Your display identity in chat."
      />
      <div className={SETTINGS_CARD_CLASS}>
        <div className="flex items-center gap-3">
          <UserAvatar size={44} src={cs.avatarDataUrl} alt={displayName} />
          <div>
            <p className="text-sm font-medium text-primary-900 dark:text-neutral-100">
              {displayName}
            </p>
            <p className="text-xs text-primary-500 dark:text-neutral-400">
              No email connected
            </p>
          </div>
        </div>
      </div>
      <div className={SETTINGS_CARD_CLASS}>
        <Row label="Display name" description="Shown in chat and sidebar">
          <div className="w-full max-w-xs">
            <Input
              value={cs.displayName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="User"
              className="h-8 w-full rounded-lg border-primary-200 text-sm"
              maxLength={50}
              aria-label="Display name"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? errorId : undefined}
            />
            {nameError && (
              <p id={errorId} className="mt-1 text-xs text-red-600" role="alert">
                {nameError}
              </p>
            )}
          </div>
        </Row>
        <Row label="Avatar">
          <div className="flex items-center gap-2">
            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={processing}
                aria-label="Upload profile picture"
                className="block max-w-[13rem] cursor-pointer text-xs text-primary-700 dark:text-neutral-300 file:mr-2 file:cursor-pointer file:rounded-lg file:border file:border-primary-200 file:bg-primary-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-primary-900 file:transition-colors hover:file:bg-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateCS({ avatarDataUrl: null })}
              disabled={!cs.avatarDataUrl || processing}
              className="h-8 rounded-lg border-primary-200 px-3"
            >
              Remove
            </Button>
          </div>
          {profileError && (
            <p className="text-xs text-red-600" role="alert">
              {profileError}
            </p>
          )}
        </Row>
      </div>
    </div>
  )
}

function AppearanceContent() {
  const { settings, updateSettings } = useSettings()

  function handleThemeChange(value: string) {
    const theme = value as SettingsThemeMode
    applyTheme(theme)
    if (theme === 'light' || theme === 'dark') {
      setTheme(getThemeVariant(getTheme(), theme))
    }
    updateSettings({ theme })
  }

  function badgeClass(color: AccentColor): string {
    if (color === 'orange') return 'bg-orange-500'
    if (color === 'purple') return 'bg-purple-500'
    if (color === 'blue') return 'bg-blue-500'
    return 'bg-green-500'
  }

  function handleAccentColorChange(selectedAccent: AccentColor) {
    localStorage.setItem('hermes-accent', selectedAccent)
    document.documentElement.setAttribute('data-accent', selectedAccent)
    applyAccentColor(selectedAccent)
    updateSettings({ accentColor: selectedAccent })
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Appearance"
        description="Theme and color accents."
      />
      <div className={SETTINGS_CARD_CLASS}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-500">
          Theme Mode
        </p>
        <div className="inline-flex rounded-lg border border-primary-200 bg-white p-1">
          {[
            { value: 'light', label: 'Light', icon: Sun01Icon },
            { value: 'dark', label: 'Dark', icon: Moon01Icon },
            { value: 'system', label: 'System', icon: ComputerIcon },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleThemeChange(option.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                settings.theme === option.value
                  ? 'bg-accent-500 text-white'
                  : 'text-primary-600 hover:bg-primary-100',
              )}
            >
              <HugeiconsIcon icon={option.icon} size={16} strokeWidth={1.5} />
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {/* Accent color removed — themes control accent */}
      <div className={SETTINGS_CARD_CLASS}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-500">
          Enterprise Theme
        </p>
        <EnterpriseThemePicker />
      </div>
      <div className={SETTINGS_CARD_CLASS}>
        <Row
          label="System metrics footer"
          description="Show a persistent footer with CPU, RAM, disk, and Hermes status."
        >
          <Switch
            checked={settings.showSystemMetricsFooter}
            onCheckedChange={(c) => updateSettings({ showSystemMetricsFooter: c })}
            aria-label="Show system metrics footer"
          />
        </Row>

        {/* Mobile chat nav removed — not relevant for Hermes */}
      </div>
    </div>
  )
}

const ENTERPRISE_THEME_FAMILIES: ThemeId[] = [
  'hermes-official',
  'hermes-classic',
  'hermes-slate',
  'hermes-mono',
]

const ENTERPRISE_THEMES = THEMES.map((theme) => ({
  ...theme,
  desc: theme.description,
  preview:
    theme.id === 'hermes-official'
      ? { bg: '#0A0E1A', panel: '#11182A', border: '#24304A', accent: '#6366F1', text: '#E6EAF2' }
      : theme.id === 'hermes-official-light'
        ? { bg: '#F6F8FC', panel: '#FFFFFF', border: '#D7DEEE', accent: '#4F46E5', text: '#111827' }
        : theme.id === 'hermes-classic'
      ? { bg: '#0d0f12', panel: '#1a1f26', border: '#2a313b', accent: '#b98a44', text: '#eceff4' }
      : theme.id === 'hermes-classic-light'
        ? { bg: '#F5F2ED', panel: '#FCFAF7', border: '#D8CCBC', accent: '#b98a44', text: '#1a1f26' }
      : theme.id === 'hermes-slate'
        ? { bg: '#0d1117', panel: '#1c2128', border: '#30363d', accent: '#7eb8f6', text: '#c9d1d9' }
        : theme.id === 'hermes-slate-light'
          ? { bg: '#F6F8FA', panel: '#FFFFFF', border: '#D0D7DE', accent: '#3b82f6', text: '#24292f' }
          : theme.id === 'hermes-mono'
            ? { bg: '#111111', panel: '#222222', border: '#333333', accent: '#aaaaaa', text: '#e6edf3' }
            : { bg: '#FAFAFA', panel: '#FFFFFF', border: '#D4D4D4', accent: '#666666', text: '#1a1a1a' },
}))

function ThemeSwatch({ colors }: { colors: typeof ENTERPRISE_THEMES[number]['preview'] }) {
  return (
    <div
      className="flex h-10 w-full overflow-hidden rounded-md border"
      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
    >
      <div className="flex h-full w-4 flex-col gap-0.5 p-0.5" style={{ backgroundColor: colors.panel }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-1.5 w-full rounded-sm" style={{ backgroundColor: colors.border }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-1">
        <div className="h-1.5 w-3/4 rounded" style={{ backgroundColor: colors.text, opacity: 0.8 }} />
        <div className="h-1 w-1/2 rounded" style={{ backgroundColor: colors.text, opacity: 0.3 }} />
        <div className="mt-0.5 h-1.5 w-6 rounded-full" style={{ backgroundColor: colors.accent }} />
      </div>
    </div>
  )
}

function EnterpriseThemePicker() {
  const { updateSettings } = useSettings()
  const [current, setCurrent] = useState(() => {
    if (typeof window === 'undefined') return 'hermes-official'
    return getTheme()
  })
  const currentMode = isDarkTheme(current) ? 'dark' : 'light'

  useEffect(() => {
    setCurrent(getTheme())
  }, [])

  function applyEnterpriseTheme(id: ThemeId) {
    setTheme(id)
    updateSettings({ theme: isDarkTheme(id) ? 'dark' : 'light' })
    setCurrent(id)
  }

  function toggleEnterpriseThemeMode() {
    const nextMode = currentMode === 'dark' ? 'light' : 'dark'
    applyEnterpriseTheme(getThemeVariant(current, nextMode))
  }

  const visibleThemes = ENTERPRISE_THEME_FAMILIES.map((themeId) =>
    ENTERPRISE_THEMES.find(
      (theme) => theme.id === getThemeVariant(themeId, currentMode),
    ),
  ).filter(Boolean) as typeof ENTERPRISE_THEMES

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-white px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-primary-900 dark:text-neutral-100">
            {currentMode === 'dark' ? 'Dark mode' : 'Light mode'}
          </p>
          <p className="text-[11px] text-primary-500 dark:text-neutral-400">
            Toggle the current theme family between paired light and dark variants.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleEnterpriseThemeMode}
          className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-900 transition-colors hover:bg-primary-100"
          aria-label={
            currentMode === 'dark'
              ? 'Switch enterprise theme to light mode'
              : 'Switch enterprise theme to dark mode'
          }
        >
          <HugeiconsIcon
            icon={currentMode === 'dark' ? Sun01Icon : Moon01Icon}
            size={16}
            strokeWidth={1.5}
          />
          {currentMode === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
      {visibleThemes.map((t) => {
        const isActive = current === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => applyEnterpriseTheme(t.id)}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors',
              isActive
                ? 'border-accent-500 bg-accent-50 text-accent-700'
                : 'border-primary-200 bg-primary-50/80 hover:bg-primary-100',
            )}
          >
            <ThemeSwatch colors={t.preview} />
            <div className="flex items-center gap-1">
              <span className="text-xs">{t.icon}</span>
              <span className="text-xs font-semibold text-primary-900 dark:text-neutral-100">{t.label}</span>
              {isActive && (
                <span className="ml-auto text-[9px] font-bold text-accent-600 uppercase tracking-wide">Active</span>
              )}
            </div>
            <p className="text-[10px] text-primary-500 dark:text-neutral-400 leading-tight">{t.desc}</p>
          </button>
        )
      })}
      </div>
    </div>
  )
}

function LoaderContent() {
  const { settings: cs, updateSettings: updateCS } = useChatSettingsStore()
  const styles: Array<{ value: LoaderStyle; label: string }> = [
    { value: 'dots', label: 'Dots' },
    { value: 'braille-claw', label: 'Claw' },
    { value: 'braille-orbit', label: 'Orbit' },
    { value: 'braille-breathe', label: 'Breathe' },
    { value: 'braille-pulse', label: 'Pulse' },
    { value: 'braille-wave', label: 'Wave' },
    { value: 'lobster', label: 'Lobster' },
    { value: 'logo', label: 'Logo' },
  ]
  function getPreset(s: LoaderStyle): BrailleSpinnerPreset | null {
    const m: Record<string, BrailleSpinnerPreset> = {
      'braille-claw': 'claw',
      'braille-orbit': 'orbit',
      'braille-breathe': 'breathe',
      'braille-pulse': 'pulse',
      'braille-wave': 'wave',
    }
    return m[s] ?? null
  }
  function Preview({ style }: { style: LoaderStyle }) {
    if (style === 'dots') return <ThreeDotsSpinner />
    if (style === 'lobster')
      return <span className="inline-block text-sm animate-pulse">🦞</span>
    if (style === 'logo') return <LogoLoader />
    const p = getPreset(style)
    return p ? (
      <BrailleSpinner
        preset={p}
        size={16}
        speed={120}
        className="text-primary-500"
      />
    ) : (
      <ThreeDotsSpinner />
    )
  }
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-500">
        Loading animation
      </p>
      <div className="grid grid-cols-4 gap-2">
        {styles.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => updateCS({ loaderStyle: o.value })}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-1.5 transition-colors',
              cs.loaderStyle === o.value
                ? 'border-accent-500 bg-accent-50 text-accent-700'
                : 'border-primary-200 bg-primary-50/80 text-primary-700 hover:bg-primary-100',
            )}
            aria-pressed={cs.loaderStyle === o.value}
          >
            <span className="flex h-4 items-center justify-center">
              <Preview style={o.value} />
            </span>
            <span className="text-[10px] font-medium leading-3">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatContent() {
  const { settings: cs, updateSettings: updateCS } = useChatSettingsStore()
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Chat"
        description="Message visibility and response loader style."
      />
      <div className={SETTINGS_CARD_CLASS}>
        <Row
          label="Show tool messages"
          description="Display tool call details in assistant responses."
        >
          <Switch
            checked={cs.showToolMessages}
            onCheckedChange={(c) => updateCS({ showToolMessages: c })}
            aria-label="Show tool messages"
          />
        </Row>
        <Row
          label="Show reasoning blocks"
          description="Display model reasoning blocks when available."
        >
          <Switch
            checked={cs.showReasoningBlocks}
            onCheckedChange={(c) => updateCS({ showReasoningBlocks: c })}
            aria-label="Show reasoning blocks"
          />
        </Row>
      </div>
      {/* Loading animation removed — not relevant for Hermes */}
    </div>
  )
}

function NotificationsContent() {
  const { settings, updateSettings } = useSettings()
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Notifications"
        description="Simple alerts and threshold controls."
      />
      <div className={SETTINGS_CARD_CLASS}>
        <Row label="Enable alerts">
          <Switch
            checked={settings.notificationsEnabled}
            onCheckedChange={(c) => updateSettings({ notificationsEnabled: c })}
            aria-label="Enable alerts"
          />
        </Row>
        <Row label="Usage threshold">
          <div className="flex w-full max-w-[14rem] items-center gap-2">
            <input
              type="range"
              min={50}
              max={100}
              value={settings.usageThreshold}
              onChange={(e) =>
                updateSettings({ usageThreshold: Number(e.target.value) })
              }
              className="w-full accent-primary-900 dark:accent-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!settings.notificationsEnabled}
              aria-label={`Usage threshold: ${settings.usageThreshold} percent`}
              aria-valuemin={50}
              aria-valuemax={100}
              aria-valuenow={settings.usageThreshold}
            />
            <span className="w-10 text-right text-sm tabular-nums text-primary-700 dark:text-neutral-300">
              {settings.usageThreshold}%
            </span>
          </div>
        </Row>
      </div>
    </div>
  )
}

function AdvancedContent() {
  const { settings, updateSettings } = useSettings()
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'connected' | 'failed'
  >('idle')
  const [urlError, setUrlError] = useState<string | null>(null)

  function validateAndUpdateUrl(value: string) {
    if (value && value.length > 0) {
      try {
        new URL(value)
        setUrlError(null)
      } catch {
        setUrlError('Invalid URL format')
      }
    } else {
      setUrlError(null)
    }
    updateSettings({ gatewayUrl: value })
  }

  async function testConnection() {
    if (urlError) return
    setConnectionStatus('testing')
    try {
      const r = await fetch('/api/ping')
      setConnectionStatus(r.ok ? 'connected' : 'failed')
    } catch {
      setConnectionStatus('failed')
    }
  }

  const urlErrorId = 'gateway-url-error'

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Advanced"
        description="Hermes endpoint and connectivity."
      />
      <div className={SETTINGS_CARD_CLASS}>
        <Row label="Hermes URL" description="Used for API requests from Studio">
          <div className="w-full max-w-sm">
            <Input
              type="url"
              placeholder="https://api.hermesworkspace.app"
              value={settings.gatewayUrl}
              onChange={(e) => validateAndUpdateUrl(e.target.value)}
              className="h-8 w-full rounded-lg border-primary-200 text-sm"
              aria-label="Hermes URL"
              aria-invalid={!!urlError}
              aria-describedby={urlError ? urlErrorId : undefined}
            />
            {urlError && (
              <p
                id={urlErrorId}
                className="mt-1 text-xs text-red-600"
                role="alert"
              >
                {urlError}
              </p>
            )}
          </div>
        </Row>
        <Row label="Connection status">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
              connectionStatus === 'connected' &&
                'border-green-500/35 bg-green-500/10 text-green-600',
              connectionStatus === 'failed' &&
                'border-red-500/35 bg-red-500/10 text-red-600',
              connectionStatus === 'testing' &&
                'border-accent-500/35 bg-accent-500/10 text-accent-600',
              connectionStatus === 'idle' &&
                'border-primary-300 bg-primary-100 text-primary-700',
            )}
          >
            {connectionStatus === 'idle'
              ? 'Not tested'
              : connectionStatus === 'testing'
                ? 'Testing...'
                : connectionStatus === 'connected'
                  ? 'Connected'
                  : 'Failed'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void testConnection()}
            disabled={connectionStatus === 'testing' || !!urlError}
            className="h-8 rounded-lg border-primary-200 px-3"
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={16}
              strokeWidth={1.5}
            />
            Test
          </Button>
        </Row>
      </div>
    </div>
  )
}

// ── Error Boundary ──────────────────────────────────────────────────────

class SettingsErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div>
            <p className="mb-2 text-sm font-medium text-red-500">
              Settings failed to load
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-xs text-primary-600 underline hover:text-primary-900"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Main Dialog ─────────────────────────────────────────────────────────

const CONTENT_MAP: Record<SectionId, () => React.JSX.Element> = {
  hermes: HermesContent,
  appearance: AppearanceContent,
  chat: ChatContent,
  notifications: NotificationsContent,
}

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [active, setActive] = useState<SectionId>('hermes')
  const [mobileView, setMobileView] = useState<'nav' | 'content'>('nav')
  const ActiveContent = CONTENT_MAP[active]

  useEffect(() => {
    if (open) {
      setMobileView('nav')
    }
  }, [open])

  function handleSectionSelect(sectionId: SectionId) {
    setActive(sectionId)
    setMobileView('content')
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 h-full w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(88dvh,740px)] md:min-h-[520px] md:w-full md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-primary-200">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-primary-200 bg-primary-50/80 px-4 py-4 md:rounded-t-2xl md:px-5">
            <div>
              <DialogTitle className="text-base font-semibold text-primary-900 dark:text-neutral-100">
                Settings
              </DialogTitle>
              <DialogDescription className="sr-only">
                Configure Hermes Workspace
              </DialogDescription>
            </div>
            <DialogClose
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="rounded-full text-primary-500 hover:bg-primary-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  aria-label="Close"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={18}
                    strokeWidth={1.5}
                  />
                </Button>
              }
            />
          </div>

          <SettingsErrorBoundary>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <aside
                className={cn(
                  'w-full bg-primary-50/60 p-2 md:w-44 md:shrink-0 md:border-r md:border-primary-200',
                  mobileView === 'content' && 'hidden md:block',
                )}
              >
                <nav className="space-y-1">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSectionSelect(s.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-primary-600 transition-colors hover:bg-primary-100',
                        active === s.id && 'bg-accent-50 font-medium text-accent-700',
                      )}
                    >
                      <HugeiconsIcon icon={s.icon} size={16} strokeWidth={1.5} />
                      {s.label}
                    </button>
                  ))}
                </nav>
              </aside>
              <div
                className={cn(
                  'min-w-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:p-5 md:pb-5',
                  mobileView === 'nav' && 'hidden md:block',
                )}
              >
                <div className="mb-3 md:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileView('nav')}
                    className="h-8 gap-1.5 rounded-lg px-2 text-primary-600 hover:bg-primary-100"
                  >
                    <HugeiconsIcon
                      icon={ArrowLeft01Icon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    Back
                  </Button>
                </div>
                <ActiveContent />
              </div>
            </div>
          </SettingsErrorBoundary>

          <div className="sticky bottom-0 z-10 border-t border-primary-200 bg-primary-50/60 px-4 py-3 text-xs text-primary-500 dark:text-neutral-400 md:rounded-b-2xl md:px-5">
            Changes saved automatically.
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
