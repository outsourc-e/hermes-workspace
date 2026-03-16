import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  CloudIcon,
  MessageMultiple01Icon,
  Notification03Icon,
  PaintBoardIcon,
  Settings02Icon,
  SourceCodeSquareIcon,
  UserIcon,
} from '@hugeicons/core-free-icons'
import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import type * as React from 'react'
import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useSettings } from '@/hooks/use-settings'
import { THEMES, getTheme, isDarkTheme, setTheme, type ThemeId } from '@/lib/theme'
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
// useWorkspaceStore removed — hamburger eliminated on mobile

export const Route = createFileRoute('/settings/')({
  component: SettingsRoute,
})

function PageThemeSwatch({
  colors,
}: {
  colors: {
    bg: string
    panel: string
    border: string
    accent: string
    text: string
  }
}) {
  return (
    <div
      className="flex h-10 w-full overflow-hidden rounded-md border"
      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
    >
      <div
        className="flex h-full w-4 flex-col gap-0.5 p-0.5"
        style={{ backgroundColor: colors.panel }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1.5 w-full rounded-sm"
            style={{ backgroundColor: colors.border }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-1">
        <div
          className="h-1.5 w-3/4 rounded"
          style={{ backgroundColor: colors.text, opacity: 0.8 }}
        />
        <div
          className="h-1 w-1/2 rounded"
          style={{ backgroundColor: colors.text, opacity: 0.3 }}
        />
        <div
          className="mt-0.5 h-1.5 w-6 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />
      </div>
    </div>
  )
}

const THEME_PREVIEWS: Record<
  ThemeId,
  { bg: string; panel: string; border: string; accent: string; text: string }
> = {
  'hermes-official': {
    bg: '#0A0E1A',
    panel: '#11182A',
    border: '#24304A',
    accent: '#6366F1',
    text: '#E6EAF2',
  },
  'hermes-official-light': {
    bg: '#F6F8FC',
    panel: '#FFFFFF',
    border: '#D7DEEE',
    accent: '#4F46E5',
    text: '#111827',
  },
  'hermes-classic': {
    bg: '#0d0f12',
    panel: '#1a1f26',
    border: '#2a313b',
    accent: '#b98a44',
    text: '#eceff4',
  },
  'hermes-slate': {
    bg: '#0d1117',
    panel: '#1c2128',
    border: '#30363d',
    accent: '#7eb8f6',
    text: '#c9d1d9',
  },
  'hermes-mono': {
    bg: '#111111',
    panel: '#222222',
    border: '#333333',
    accent: '#aaaaaa',
    text: '#e6edf3',
  },
  'hermes-classic-light': {
    bg: '#F5F2ED',
    panel: '#FFFFFF',
    border: '#D9D0C4',
    accent: '#b98a44',
    text: '#1a1f26',
  },
  'hermes-slate-light': {
    bg: '#F6F8FA',
    panel: '#FFFFFF',
    border: '#D0D7DE',
    accent: '#3b82f6',
    text: '#1F2328',
  },
  'hermes-mono-light': {
    bg: '#FAFAFA',
    panel: '#FFFFFF',
    border: '#D4D4D4',
    accent: '#666666',
    text: '#1a1a1a',
  },
}

function WorkspaceThemePicker() {
  const { updateSettings } = useSettings()
  const [current, setCurrent] = useState<ThemeId>(() => getTheme())

  function applyWorkspaceTheme(id: ThemeId) {
    setTheme(id)
    updateSettings({ theme: isDarkTheme(id) ? 'dark' : 'light' })
    setCurrent(id)
  }

  return (
    <div className="grid w-full gap-2 md:grid-cols-3">
      {THEMES.map((t) => {
        const isActive = current === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => applyWorkspaceTheme(t.id)}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
              isActive
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-subtle)] text-[var(--theme-text)]'
                : 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]',
            )}
          >
            <PageThemeSwatch colors={THEME_PREVIEWS[t.id]} />
            <div className="flex items-center gap-1.5">
              <span className="text-xs">{t.icon}</span>
              <span className="text-xs font-semibold">{t.label}</span>
              {isActive && (
                <span className="ml-auto text-[9px] font-bold uppercase tracking-wide text-[var(--theme-accent)]">
                  Active
                </span>
              )}
            </div>
            <p className="text-[10px] leading-tight text-[var(--theme-muted)]">
              {t.description}
            </p>
          </button>
        )
      })}
    </div>
  )
}

type SectionProps = {
  title: string
  description: string
  icon: React.ComponentProps<typeof HugeiconsIcon>['icon']
  children: React.ReactNode
}

function SettingsSection({ title, description, icon, children }: SectionProps) {
  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm backdrop-blur-xl md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-xl border border-primary-200 bg-primary-100/70">
          <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-medium text-primary-900 text-balance">
            {title}
          </h2>
          <p className="text-sm text-primary-600 text-pretty">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

type RowProps = {
  label: string
  description?: string
  children: React.ReactNode
}

function SettingsRow({ label, description, children }: RowProps) {
  return (
    <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary-900 text-balance">
          {label}
        </p>
        {description ? (
          <p className="text-xs text-primary-600 text-pretty">{description}</p>
        ) : null}
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto md:justify-end">
        {children}
      </div>
    </div>
  )
}

type SettingsSectionId =
  | 'profile'
  | 'appearance'
  | 'chat'
  | 'hermes'
  | 'notifications'
  | 'advanced'

type SettingsNavItem = {
  id: SettingsSectionId
  label: string
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'hermes', label: 'Hermes Agent' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'chat', label: 'Chat' },
  { id: 'notifications', label: 'Notifications' },
]

function SettingsRoute() {
  usePageTitle('Settings')
  const { settings, updateSettings } = useSettings()

  // Phase 4.2: Fetch models for preferred model dropdowns
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; label: string }>
  >([])
  const [modelsError, setModelsError] = useState(false)

  useEffect(() => {
    async function fetchModels() {
      setModelsError(false)
      try {
        const res = await fetch('/api/models')
        if (!res.ok) {
          setModelsError(true)
          return
        }
        const data = await res.json()
        const models = Array.isArray(data.models) ? data.models : []
        setAvailableModels(
          models.map((m: any) => ({
            id: m.id || '',
            label: m.id?.split('/').pop() || m.id || '',
          })),
        )
      } catch {
        setModelsError(true)
      }
    }
    void fetchModels()
  }, [])

  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>('hermes')

  return (
    <div className="min-h-screen bg-surface text-primary-900">
      <div className="pointer-events-none fixed inset-0 bg-radial from-primary-400/20 via-transparent to-transparent" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary-100/25 via-transparent to-primary-300/20" />

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-6 pb-24 sm:px-6 md:flex-row md:gap-6 md:pb-8 lg:pt-8">
        {/* Sidebar nav */}
        <nav className="hidden w-48 shrink-0 md:block">
          <div className="sticky top-8">
            <h1 className="mb-4 text-lg font-semibold text-primary-900 px-3">
              Settings
            </h1>
            <div className="flex flex-col gap-0.5">
              {SETTINGS_NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    activeSection === item.id
                      ? 'bg-accent-500/10 text-accent-600 font-medium'
                      : 'text-primary-600 hover:bg-primary-100 hover:text-primary-900',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Mobile header */}
        <div className="flex items-center gap-2 md:hidden">
          <h1 className="text-lg font-semibold text-primary-900">Settings</h1>
        </div>

        {/* Mobile section pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none md:hidden">
          {SETTINGS_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                activeSection === item.id
                  ? 'bg-accent-500 text-white'
                  : 'bg-primary-100 text-primary-600',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* ── Hermes Agent ──────────────────────────────────── */}
          {activeSection === 'hermes' && <HermesConfigSection />}

          {/* ── Appearance ──────────────────────────────────────── */}
          {activeSection === 'appearance' && (
            <>
              <SettingsSection
                title="Appearance"
                description="Choose a workspace theme and accent color."
                icon={PaintBoardIcon}
              >
                <SettingsRow
                  label="Theme"
                  description="All workspace themes are dark. Pick the palette you want to use."
                >
                  <div className="w-full">
                    <WorkspaceThemePicker />
                  </div>
                </SettingsRow>

                {/* Accent color removed — themes control accent */}

              </SettingsSection>
              {/* LoaderStyleSection removed — not relevant for Hermes */}
            </>
          )}

          {/* ── Chat ────────────────────────────────────────────── */}
          {activeSection === 'chat' && <ChatDisplaySection />}

          {/* ── Editor ──────────────────────────────────────────── */}
          {activeSection === ('editor' as SettingsSectionId) && (
            <SettingsSection
              title="Editor"
              description="Configure Monaco defaults for the files workspace."
              icon={SourceCodeSquareIcon}
            >
              <SettingsRow
                label="Font size"
                description="Adjust editor font size between 12 and 20."
              >
                <div className="flex w-full items-center gap-2 md:max-w-xs">
                  <input
                    type="range"
                    min={12}
                    max={20}
                    value={settings.editorFontSize}
                    onChange={(e) =>
                      updateSettings({ editorFontSize: Number(e.target.value) })
                    }
                    className="w-full accent-primary-900 dark:accent-primary-400"
                    aria-label={`Editor font size: ${settings.editorFontSize} pixels`}
                    aria-valuemin={12}
                    aria-valuemax={20}
                    aria-valuenow={settings.editorFontSize}
                  />
                  <span className="w-12 text-right text-sm tabular-nums text-primary-700">
                    {settings.editorFontSize}px
                  </span>
                </div>
              </SettingsRow>
              <SettingsRow
                label="Word wrap"
                description="Wrap long lines in the editor by default."
              >
                <Switch
                  checked={settings.editorWordWrap}
                  onCheckedChange={(checked) =>
                    updateSettings({ editorWordWrap: checked })
                  }
                  aria-label="Word wrap"
                />
              </SettingsRow>
              <SettingsRow
                label="Minimap"
                description="Show minimap preview in Monaco editor."
              >
                <Switch
                  checked={settings.editorMinimap}
                  onCheckedChange={(checked) =>
                    updateSettings({ editorMinimap: checked })
                  }
                  aria-label="Show minimap"
                />
              </SettingsRow>
            </SettingsSection>
          )}

          {/* ── Notifications ───────────────────────────────────── */}
          {activeSection === 'notifications' && (
            <>
              <SettingsSection
                title="Notifications"
                description="Control alert delivery and usage warning threshold."
                icon={Notification03Icon}
              >
                <SettingsRow
                  label="Enable alerts"
                  description="Show usage and system alert notifications."
                >
                  <Switch
                    checked={settings.notificationsEnabled}
                    onCheckedChange={(checked) =>
                      updateSettings({ notificationsEnabled: checked })
                    }
                    aria-label="Enable alerts"
                  />
                </SettingsRow>
                <SettingsRow
                  label="Usage threshold"
                  description="Set usage warning trigger between 50% and 100%."
                >
                  <div className="flex w-full items-center gap-2 md:max-w-xs">
                    <input
                      type="range"
                      min={50}
                      max={100}
                      value={settings.usageThreshold}
                      onChange={(e) =>
                        updateSettings({ usageThreshold: Number(e.target.value) })
                      }
                      className="w-full accent-primary-900 dark:accent-primary-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!settings.notificationsEnabled}
                      aria-label={`Usage threshold: ${settings.usageThreshold} percent`}
                      aria-valuemin={50}
                      aria-valuemax={100}
                      aria-valuenow={settings.usageThreshold}
                    />
                    <span className="w-12 text-right text-sm tabular-nums text-primary-700">
                      {settings.usageThreshold}%
                    </span>
                  </div>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection
                title="Smart Suggestions"
                description="Get proactive model suggestions to optimize cost and quality."
                icon={Settings02Icon}
              >
                <SettingsRow
                  label="Enable smart suggestions"
                  description="Suggest cheaper models for simple tasks or better models for complex work."
                >
                  <Switch
                    checked={settings.smartSuggestionsEnabled}
                    onCheckedChange={(checked) =>
                      updateSettings({ smartSuggestionsEnabled: checked })
                    }
                    aria-label="Enable smart suggestions"
                  />
                </SettingsRow>
                <SettingsRow
                  label="Preferred budget model"
                  description="Default model for cheaper suggestions (leave empty for auto-detect)."
                >
                  <select
                    value={settings.preferredBudgetModel}
                    onChange={(e) =>
                      updateSettings({ preferredBudgetModel: e.target.value })
                    }
                    className="h-9 w-full rounded-lg border border-primary-200 dark:border-gray-600 bg-primary-50 dark:bg-gray-800 px-3 text-sm text-primary-900 dark:text-gray-100 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-400 dark:focus-visible:ring-primary-500 md:max-w-xs"
                    aria-label="Preferred budget model"
                  >
                    <option value="">Auto-detect</option>
                    {modelsError && (
                      <option disabled>Failed to load models</option>
                    )}
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <SettingsRow
                  label="Preferred premium model"
                  description="Default model for upgrade suggestions (leave empty for auto-detect)."
                >
                  <select
                    value={settings.preferredPremiumModel}
                    onChange={(e) =>
                      updateSettings({ preferredPremiumModel: e.target.value })
                    }
                    className="h-9 w-full rounded-lg border border-primary-200 dark:border-gray-600 bg-primary-50 dark:bg-gray-800 px-3 text-sm text-primary-900 dark:text-gray-100 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-400 dark:focus-visible:ring-primary-500 md:max-w-xs"
                    aria-label="Preferred premium model"
                  >
                    <option value="">Auto-detect</option>
                    {modelsError && (
                      <option disabled>Failed to load models</option>
                    )}
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <SettingsRow
                  label="Only suggest cheaper models"
                  description="Never suggest upgrades, only suggest cheaper alternatives."
                >
                  <Switch
                    checked={settings.onlySuggestCheaper}
                    onCheckedChange={(checked) =>
                      updateSettings({ onlySuggestCheaper: checked })
                    }
                    aria-label="Only suggest cheaper models"
                  />
                </SettingsRow>
              </SettingsSection>
            </>
          )}

          <footer className="mt-auto pt-4">
            <div className="flex items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50/70 p-3 text-sm text-primary-600 backdrop-blur-sm">
              <HugeiconsIcon
                icon={Settings02Icon}
                size={20}
                strokeWidth={1.5}
              />
              <span className="text-pretty">
                Changes are saved automatically to local storage.
              </span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}

// ── Profile Section ─────────────────────────────────────────────────────

const PROFILE_IMAGE_MAX_DIMENSION = 128
const PROFILE_IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024

function _ProfileSection() {
  const { settings: chatSettings, updateSettings: updateChatSettings } =
    useChatSettingsStore()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileProcessing, setProfileProcessing] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const displayName = getChatProfileDisplayName(chatSettings.displayName)

  function handleNameChange(value: string) {
    if (value.length > 50) {
      setNameError('Display name too long (max 50 characters)')
      return
    }
    setNameError(null)
    updateChatSettings({ displayName: value })
  }

  async function handleAvatarUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileError('Unsupported file type.')
      return
    }
    if (file.size > PROFILE_IMAGE_MAX_FILE_SIZE) {
      setProfileError('Image too large (max 10MB).')
      return
    }
    setProfileError(null)
    setProfileProcessing(true)
    try {
      const url = URL.createObjectURL(file)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('Failed to load image'))
        i.src = url
      })
      const max = PROFILE_IMAGE_MAX_DIMENSION
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      updateChatSettings({ avatarDataUrl: canvas.toDataURL(outputType, 0.82) })
    } catch {
      setProfileError('Failed to process image.')
    } finally {
      setProfileProcessing(false)
    }
  }

  return (
    <SettingsSection
      title="Profile"
      description="Your display name and avatar for chat."
      icon={UserIcon}
    >
      <div className="flex items-center gap-4">
        <UserAvatar
          size={56}
          src={chatSettings.avatarDataUrl}
          alt={displayName}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary-900">{displayName}</p>
          <p className="text-xs text-primary-500">
            Shown in the sidebar and chat messages.
          </p>
        </div>
      </div>
      <SettingsRow label="Display name" description="Leave blank for default.">
        <div className="w-full md:max-w-xs">
          <Input
            value={chatSettings.displayName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="User"
            className="h-9 w-full"
            maxLength={50}
            aria-label="Display name"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'profile-name-error' : undefined}
          />
          {nameError && (
            <p
              id="profile-name-error"
              className="mt-1 text-xs text-red-600"
              role="alert"
            >
              {nameError}
            </p>
          )}
        </div>
      </SettingsRow>
      <SettingsRow
        label="Profile picture"
        description="Resized to 128×128, stored locally."
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={profileProcessing}
                aria-label="Upload profile picture"
                className="block w-full cursor-pointer text-xs text-primary-700 dark:text-gray-300 md:max-w-xs file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-primary-200 dark:file:border-gray-600 file:bg-primary-100 dark:file:bg-gray-700 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-primary-900 dark:file:text-gray-100 file:transition-colors hover:file:bg-primary-200 dark:hover:file:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateChatSettings({ avatarDataUrl: null })}
              disabled={!chatSettings.avatarDataUrl || profileProcessing}
            >
              Remove
            </Button>
          </div>
          {profileError && (
            <p className="text-xs text-red-600" role="alert">
              {profileError}
            </p>
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  )
}

// ── Chat Display Section ────────────────────────────────────────────────

function ChatDisplaySection() {
  const { settings: chatSettings, updateSettings: updateChatSettings } =
    useChatSettingsStore()
  const { settings, updateSettings } = useSettings()

  return (
    <>
    <SettingsSection
      title="Chat Display"
      description="Control what's visible in chat messages."
      icon={MessageMultiple01Icon}
    >
      <SettingsRow
        label="Show tool messages"
        description="Display tool call details when the agent uses tools."
      >
        <Switch
          checked={chatSettings.showToolMessages}
          onCheckedChange={(checked) =>
            updateChatSettings({ showToolMessages: checked })
          }
          aria-label="Show tool messages"
        />
      </SettingsRow>
      <SettingsRow
        label="Show reasoning blocks"
        description="Display model thinking and reasoning process."
      >
        <Switch
          checked={chatSettings.showReasoningBlocks}
          onCheckedChange={(checked) =>
            updateChatSettings({ showReasoningBlocks: checked })
          }
          aria-label="Show reasoning blocks"
        />
      </SettingsRow>
    </SettingsSection>
    {/* Mobile Navigation removed — not relevant for Hermes Workspace */}
    </>
  )
}

// ── Loader Style Section ────────────────────────────────────────────────

type LoaderStyleOption = { value: LoaderStyle; label: string }

const LOADER_STYLES: LoaderStyleOption[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'braille-claw', label: 'Claw' },
  { value: 'braille-orbit', label: 'Orbit' },
  { value: 'braille-breathe', label: 'Breathe' },
  { value: 'braille-pulse', label: 'Pulse' },
  { value: 'braille-wave', label: 'Wave' },
  { value: 'lobster', label: 'Lobster' },
  { value: 'logo', label: 'Logo' },
]

function getPreset(style: LoaderStyle): BrailleSpinnerPreset | null {
  const map: Record<string, BrailleSpinnerPreset> = {
    'braille-claw': 'claw',
    'braille-orbit': 'orbit',
    'braille-breathe': 'breathe',
    'braille-pulse': 'pulse',
    'braille-wave': 'wave',
  }
  return map[style] ?? null
}

function LoaderPreview({ style }: { style: LoaderStyle }) {
  if (style === 'dots') return <ThreeDotsSpinner />
  if (style === 'lobster')
    return <span className="inline-block text-sm animate-pulse">🦞</span>
  if (style === 'logo') return <LogoLoader />
  const preset = getPreset(style)
  return preset ? (
    <BrailleSpinner
      preset={preset}
      size={16}
      speed={120}
      className="text-primary-500"
    />
  ) : (
    <ThreeDotsSpinner />
  )
}

function _LoaderStyleSection() {
  const { settings: chatSettings, updateSettings: updateChatSettings } =
    useChatSettingsStore()

  return (
    <SettingsSection
      title="Loading Animation"
      description="Choose the animation while the assistant is streaming."
      icon={Settings02Icon}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LOADER_STYLES.map((option) => {
          const active = chatSettings.loaderStyle === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateChatSettings({ loaderStyle: option.value })}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-2 transition-colors',
                active
                  ? 'border-primary-500 bg-primary-200/60 text-primary-900'
                  : 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100',
              )}
              aria-pressed={active}
            >
              <span className="flex h-5 items-center justify-center">
                <LoaderPreview style={option.value} />
              </span>
              <span className="text-[11px] font-medium text-center leading-4">
                {option.label}
              </span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}

// ── Hermes Agent Configuration ──────────────────────────────────────

type HermesProvider = {
  id: string
  name: string
  authType: string
  envKeys: string[]
  configured: boolean
  maskedKeys: Record<string, string>
}

type HermesConfigData = {
  config: Record<string, unknown>
  providers: HermesProvider[]
  activeProvider: string
  activeModel: string
  hermesHome: string
}

function HermesConfigSection() {
  const [data, setData] = useState<HermesConfigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [providerInput, setProviderInput] = useState('')

  useEffect(() => {
    fetch('/api/hermes-config')
      .then((r) => r.json())
      .then((d: HermesConfigData) => {
        setData(d)
        setModelInput((d.activeModel as string) || '')
        setProviderInput((d.activeProvider as string) || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const saveConfig = async (updates: { config?: Record<string, unknown>; env?: Record<string, string> }) => {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/hermes-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const result = await res.json() as { message?: string }
      setSaveMessage(result.message || 'Saved')
      // Refresh data
      const refreshRes = await fetch('/api/hermes-config')
      const refreshData = await refreshRes.json() as HermesConfigData
      setData(refreshData)
      setTimeout(() => setSaveMessage(null), 3000)
    } catch {
      setSaveMessage('Failed to save')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <SettingsSection title="Hermes Agent" description="Loading configuration..." icon={Settings02Icon}>
        <div className="animate-pulse h-20 rounded-lg" style={{ backgroundColor: 'var(--theme-panel)' }} />
      </SettingsSection>
    )
  }

  if (!data) {
    return (
      <SettingsSection title="Hermes Agent" description="Could not load Hermes configuration." icon={Settings02Icon}>
        <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
          Make sure Hermes Agent is running on localhost:8642
        </p>
      </SettingsSection>
    )
  }

  const memoryConfig = (data.config.memory as Record<string, unknown>) || {}
  const terminalConfig = (data.config.terminal as Record<string, unknown>) || {}
  const displayConfig = (data.config.display as Record<string, unknown>) || {}

  return (
    <>
      {saveMessage && (
        <div className="rounded-lg px-3 py-2 text-sm font-medium" style={{
          backgroundColor: saveMessage.includes('Failed') ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          color: saveMessage.includes('Failed') ? '#ef4444' : '#22c55e',
        }}>
          {saveMessage}
        </div>
      )}

      {/* Model & Provider */}
      <SettingsSection
        title="Model & Provider"
        description="Configure the default AI model for Hermes Agent."
        icon={SourceCodeSquareIcon}
      >
        <SettingsRow label="Active model" description="The model Hermes uses for conversations.">
          <div className="flex gap-2 w-full max-w-sm">
            <Input
              value={modelInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModelInput(e.target.value)}
              placeholder="e.g. gpt-5.3-codex"
              className="flex-1"
            />
          </div>
        </SettingsRow>
        <SettingsRow label="Provider" description="The model provider backend.">
          <div className="flex gap-2 w-full max-w-sm">
            <Input
              value={providerInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProviderInput(e.target.value)}
              placeholder="e.g. openai-codex"
              className="flex-1"
            />
          </div>
        </SettingsRow>
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            disabled={saving}
            onClick={() => saveConfig({ config: { model: { default: modelInput, provider: providerInput } } })}
          >
            {saving ? 'Saving...' : 'Save Model'}
          </Button>
        </div>
      </SettingsSection>

      {/* API Keys */}
      <SettingsSection
        title="API Keys"
        description="Manage provider API keys stored in ~/.hermes/.env"
        icon={CloudIcon}
      >
        {data.providers
          .filter((p) => p.envKeys.length > 0)
          .map((provider) => (
            <SettingsRow
              key={provider.id}
              label={provider.name}
              description={provider.configured ? '✅ Configured' : '❌ Not configured'}
            >
              <div className="flex items-center gap-2 w-full max-w-sm">
                {provider.envKeys.map((envKey) => (
                  <div key={envKey} className="flex-1">
                    {editingKey === envKey ? (
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          value={keyInput}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKeyInput(e.target.value)}
                          placeholder={`Enter ${envKey}`}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            saveConfig({ env: { [envKey]: keyInput } })
                            setEditingKey(null)
                            setKeyInput('')
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingKey(null); setKeyInput('') }}
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: 'var(--theme-muted)' }}>
                          {provider.maskedKeys[envKey] || 'Not set'}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingKey(envKey); setKeyInput('') }}
                        >
                          {provider.configured ? 'Change' : 'Add'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SettingsRow>
          ))}
      </SettingsSection>

      {/* Memory */}
      <SettingsSection
        title="Memory"
        description="Configure Hermes Agent memory and user profiles."
        icon={UserIcon}
      >
        <SettingsRow label="Memory enabled" description="Store and recall memories across sessions.">
          <Switch
            checked={memoryConfig.memory_enabled !== false}
            onCheckedChange={(checked: boolean) =>
              saveConfig({ config: { memory: { memory_enabled: checked } } })
            }
          />
        </SettingsRow>
        <SettingsRow label="User profile" description="Remember user preferences and context.">
          <Switch
            checked={memoryConfig.user_profile_enabled !== false}
            onCheckedChange={(checked: boolean) =>
              saveConfig({ config: { memory: { user_profile_enabled: checked } } })
            }
          />
        </SettingsRow>
      </SettingsSection>

      {/* Terminal */}
      <SettingsSection
        title="Terminal"
        description="Shell execution settings."
        icon={SourceCodeSquareIcon}
      >
        <SettingsRow label="Backend" description="Terminal execution backend.">
          <span className="text-sm font-mono" style={{ color: 'var(--theme-muted)' }}>
            {(terminalConfig.backend as string) || 'local'}
          </span>
        </SettingsRow>
        <SettingsRow label="Timeout" description="Max seconds for terminal commands.">
          <span className="text-sm font-mono" style={{ color: 'var(--theme-muted)' }}>
            {(terminalConfig.timeout as number) || 180}s
          </span>
        </SettingsRow>
      </SettingsSection>

      {/* Display */}
      <SettingsSection
        title="Display"
        description="CLI display preferences (reflected in agent behavior)."
        icon={PaintBoardIcon}
      >
        <SettingsRow label="Personality" description="Agent response style.">
          <span className="text-sm font-mono" style={{ color: 'var(--theme-muted)' }}>
            {(displayConfig.personality as string) || 'default'}
          </span>
        </SettingsRow>
        <SettingsRow label="Skin" description="CLI theme skin.">
          <span className="text-sm font-mono" style={{ color: 'var(--theme-muted)' }}>
            {(displayConfig.skin as string) || 'default'}
          </span>
        </SettingsRow>
      </SettingsSection>

      {/* Info */}
      <SettingsSection
        title="About"
        description="Hermes Agent runtime information."
        icon={Notification03Icon}
      >
        <SettingsRow label="Config location" description="Where Hermes stores its configuration.">
          <span className="text-xs font-mono" style={{ color: 'var(--theme-muted)' }}>
            {data.hermesHome}
          </span>
        </SettingsRow>
        <SettingsRow label="Active provider" description="Current inference provider.">
          <span className="text-sm font-medium" style={{ color: 'var(--theme-accent)' }}>
            {data.providers.find((p) => p.id === data.activeProvider)?.name || data.activeProvider}
          </span>
        </SettingsRow>
      </SettingsSection>
    </>
  )
}
