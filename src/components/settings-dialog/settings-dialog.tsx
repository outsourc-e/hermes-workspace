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
import type { ThemeId } from '@/lib/theme'
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
  | 'profile'
  | 'appearance'
  | 'chat'
  | 'notifications'
  | 'advanced'

const SECTIONS: Array<{ id: SectionId; label: string; icon: any }> = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'appearance', label: 'Appearance', icon: PaintBoardIcon },
  { id: 'chat', label: 'Chat', icon: MessageMultiple01Icon },
  { id: 'notifications', label: 'Notifications', icon: Notification03Icon },
  { id: 'advanced', label: 'Advanced', icon: CloudIcon },
]

const DARK_ENTERPRISE_THEMES = new Set<ThemeId>([
  'ops-dark',
  'premium-dark',
  'sunset-brand',
  'hermes',])

function isDarkEnterpriseTheme(theme: string | null): theme is ThemeId {
  if (!theme) return false
  return DARK_ENTERPRISE_THEMES.has(theme as ThemeId)
}

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
    updateSettings({ theme })
    
    // If user switches to light/dark via the standard toggle, update enterprise theme too
    const currentEnterpriseTheme = localStorage.getItem('clawsuite-theme')
    if (
      theme === 'light' &&
      currentEnterpriseTheme &&
      isDarkEnterpriseTheme(currentEnterpriseTheme)
    ) {
      // Switch to Paper Light when going light
      const html = document.documentElement
      html.setAttribute('data-theme', 'paper-light')
      localStorage.setItem('clawsuite-theme', 'paper-light')
    } else if (
      theme === 'dark' &&
      (!currentEnterpriseTheme || !isDarkEnterpriseTheme(currentEnterpriseTheme))
    ) {
      // Switch to Ops Dark when going dark (default)
      const html = document.documentElement
      html.setAttribute('data-theme', 'ops-dark')
      localStorage.setItem('clawsuite-theme', 'ops-dark')
    }
  }

  function badgeClass(color: AccentColor): string {
    if (color === 'orange') return 'bg-orange-500'
    if (color === 'purple') return 'bg-purple-500'
    if (color === 'blue') return 'bg-blue-500'
    return 'bg-green-500'
  }

  function handleAccentColorChange(selectedAccent: AccentColor) {
    localStorage.setItem('clawsuite-accent', selectedAccent)
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
      <div className={SETTINGS_CARD_CLASS}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-500">
          Accent Color
        </p>
        <div className="flex items-center gap-2">
          {(['orange', 'purple', 'blue', 'green'] as const).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => handleAccentColorChange(color)}
              aria-label={`Set accent color to ${color}`}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-full border transition-colors',
                settings.accentColor === color
                  ? 'border-primary-900 bg-primary-100'
                  : 'border-primary-200 bg-white hover:bg-primary-100',
              )}
            >
              <span className={cn('size-4 rounded-full', badgeClass(color))} />
            </button>
          ))}
        </div>
      </div>
      <div className={SETTINGS_CARD_CLASS}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-500">
          Enterprise Theme
        </p>
        <EnterpriseThemePicker />
      </div>
      <div className={SETTINGS_CARD_CLASS}>
        <Row
          label="System metrics footer"
          description="Show a persistent footer with CPU, RAM, disk, and gateway status."
        >
          <Switch
            checked={settings.showSystemMetricsFooter}
            onCheckedChange={(c) => updateSettings({ showSystemMetricsFooter: c })}
            aria-label="Show system metrics footer"
          />
        </Row>

        <Row
          label="Mobile chat nav"
          description="How the bottom nav behaves on chat screens."
        >
          <select
            value={settings.mobileChatNavMode ?? 'dock'}
            onChange={(e) => updateSettings({ mobileChatNavMode: e.target.value as 'dock' | 'integrated' | 'scroll-hide' })}
            className="rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <option value="dock">Dock (iMessage)</option>
            <option value="scroll-hide">Scroll-hide (B)</option>
            <option value="integrated">Integrated (C)</option>
          </select>
        </Row>
      </div>
    </div>
  )
}

const ENTERPRISE_THEMES = [
  {
    id: 'paper-light',
    label: 'Clean',
    icon: '☀️',
    desc: 'Warm gray canvas with white cards',
    preview: { bg: '#f5f5f5', panel: '#ffffff', border: '#e5e5e5', accent: '#f97316', text: '#1a1a1a' },
  },
  {
    id: 'ops-dark',
    label: 'Slate',
    icon: '🖥️',
    desc: 'Deep slate with teal secondary glow',
    preview: { bg: '#1e1e2e', panel: '#2a2a3e', border: '#3a3a4e', accent: '#14b8a6', text: '#e5e5e5' },
  },
  {
    id: 'premium-dark',
    label: 'Midnight',
    icon: '✨',
    desc: 'OLED true black with high contrast',
    preview: { bg: '#000000', panel: '#0a0a0a', border: '#1a1a1a', accent: '#f97316', text: '#f5f5f5' },
  },
  {
    id: 'sunset-brand',
    label: 'Sunset',
    icon: '🌇',
    desc: 'Warm brown brand immersion',
    preview: { bg: '#1a0e05', panel: '#2a1a0e', border: '#6b3c1b', accent: '#f59e0b', text: '#ffe7d1' },
  },
  {
    id: 'hermes',
    label: 'Hermes',
    icon: '⚕',
    desc: 'Nous Research deep blue',
    preview: { bg: '#0A0E1A', panel: '#1A2240', border: 'rgba(48,80,255,0.18)', accent: '#3050FF', text: '#E8ECFF' },
  },
] as const

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
    if (typeof window === 'undefined') return 'paper-light'
    const stored = localStorage.getItem('clawsuite-theme')
    return ENTERPRISE_THEMES.some((theme) => theme.id === stored)
      ? stored
      : 'paper-light'
  })

  function applyEnterpriseTheme(id: ThemeId) {
    const html = document.documentElement
    html.setAttribute('data-theme', id)
    if (DARK_ENTERPRISE_THEMES.has(id)) {
      html.classList.add('dark')
      html.classList.remove('light')
      // Sync with settings store
      updateSettings({ theme: 'dark' })
    } else {
      html.classList.add('light')
      html.classList.remove('dark')
      // Sync with settings store
      updateSettings({ theme: 'light' })
    }
    localStorage.setItem('clawsuite-theme', id)
    setCurrent(id)
  }

  return (
    <div className="grid w-full grid-cols-2 gap-2">
      {ENTERPRISE_THEMES.map((t) => {
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
      <div className={SETTINGS_CARD_CLASS}>
        <LoaderContent />
      </div>
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
        description="Gateway endpoint and connectivity."
      />
      <div className={SETTINGS_CARD_CLASS}>
        <Row label="Gateway URL" description="Used for API requests from Studio">
          <div className="w-full max-w-sm">
            <Input
              type="url"
              placeholder="https://api.openclaw.ai"
              value={settings.gatewayUrl}
              onChange={(e) => validateAndUpdateUrl(e.target.value)}
              className="h-8 w-full rounded-lg border-primary-200 text-sm"
              aria-label="Gateway URL"
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
  profile: ProfileContent,
  appearance: AppearanceContent,
  chat: ChatContent,
  notifications: NotificationsContent,
  advanced: AdvancedContent,
}

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [active, setActive] = useState<SectionId>('profile')
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
