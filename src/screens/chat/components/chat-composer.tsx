import { createPortal } from 'react-dom'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  Delete01Icon,
  Mic01Icon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, Ref } from 'react'

import type { ModelCatalogEntry, ModelSwitchResponse } from '@/lib/model-types'
import type {
  SlashCommandDefinition,
  SlashCommandMenuHandle,
} from '@/components/slash-command-menu'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/prompt-kit/prompt-input'
import { SlashCommandMenu } from '@/components/slash-command-menu'
import { useSettings } from '@/hooks/use-settings'
import { MOBILE_TAB_BAR_OFFSET } from '@/components/mobile-tab-bar'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { Button } from '@/components/ui/button'
import { usePinnedModels } from '@/hooks/use-pinned-models'
// import { ModeSelector } from '@/components/mode-selector'
import { cn } from '@/lib/utils'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
import { toast } from '@/components/ui/toast'
import {
  getZeroForkModelInfoFlags,
  MODEL_SWITCH_BLOCKED_TOAST,
  shouldBlockZeroForkModelSwitch,
} from './chat-composer-model-switch'

type ChatComposerAttachment = {
  id: string
  name: string
  contentType: string
  size: number
  dataUrl?: string
  previewUrl?: string
  kind?: 'image' | 'file' | 'audio'
}

type ThinkingLevel = 'off' | 'low' | 'adaptive'

type ChatComposerProps = {
  onSubmit: (
    value: string,
    attachments: Array<ChatComposerAttachment>,
    fastMode: boolean,
    helpers: ChatComposerHelpers,
  ) => void
  isLoading: boolean
  disabled: boolean
  sessionKey?: string
  wrapperRef?: Ref<HTMLDivElement>
  composerRef?: Ref<ChatComposerHandle>
  focusKey?: string
  onNewSession?: () => void
  onToggleWebSearch?: (enabled: boolean) => void
  webSearchEnabled?: boolean
  /** Current thinking level for this session */
  thinkingLevel?: ThinkingLevel
  /** Called when user changes thinking level */
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  onAbort?: () => void
  /** Embedded inside another surface (e.g. Operations card), so mobile composer
   * must stay inline instead of docking fixed to the viewport bottom. */
  embedded?: boolean
  hideModelSelector?: boolean
}

type ChatComposerHelpers = {
  reset: () => void
  setValue: (value: string) => void
  setAttachments: (attachments: Array<ChatComposerAttachment>) => void
}

type ChatComposerHandle = {
  setValue: (value: string) => void
  insertText: (value: string) => void
}

function nextThinkingLevel(level: ThinkingLevel): ThinkingLevel {
  if (level === 'off') return 'low'
  if (level === 'low') return 'adaptive'
  return 'off'
}

/** Returns true if the model id suggests Claude 4.6 (should default to adaptive) */
function isClaude46Model(model: string): boolean {
  const normalized = model.toLowerCase()
  return normalized.includes('4-6') || normalized.includes('claude-4.6')
}

type SessionStatusApiResponse = {
  ok?: boolean
  payload?: unknown
  error?: string
  [key: string]: unknown
}

type GatewayStatusApiResponse = {
  mode?: string
}

type ModelInfoApiResponse = {
  gatewayMode?: string | null
  supportsRuntimeSwitching?: boolean | null
  vanillaAgent?: boolean | null
}

type ModelSwitchNotice = {
  tone: 'success' | 'error'
  message: string
  retryModel?: string
  retryProvider?: string
}

// Models are fetched through the workspace API proxy (/api/models, /api/claude-proxy)
// to support Docker and reverse-proxy deployments where the browser cannot reach
// the Claude gateway directly.

function readModelText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

type ClaudeCatalogEntry =
  | string
  | {
      id: string
      provider: string
      name: string
      [key: string]: unknown
    }

function isClaudeCatalogEntry(
  entry: ClaudeCatalogEntry | null,
): entry is ClaudeCatalogEntry {
  return entry !== null
}

type ClaudeProviderOption = {
  id: string
  label: string
  authenticated: boolean
}

type ClaudeAvailableModelsResponse = {
  provider: string
  models: Array<{ id: string; description: string }>
  providers: Array<ClaudeProviderOption>
}

async function fetchModels(): Promise<{
  ok?: boolean
  models?: Array<ModelCatalogEntry>
  configuredProviders?: Array<string>
  currentProvider?: string
  providerLabels?: Record<string, string>
  providers?: Array<ClaudeProviderOption>
}> {
  // Use the curated /api/models endpoint which returns only models
  // actually configured and available (OCPlatform gateway + local providers).
  // Previously this hit /api/claude-proxy/api/available-models which returned
  // every upstream provider model — flooding the picker with unusable options.
  const response = await fetch('/api/models')
  if (!response.ok) {
    throw new Error(`Models request failed (${response.status})`)
  }

  const payload = (await response.json()) as
    | Array<unknown>
    | {
        data?: Array<Record<string, unknown>>
        models?: Array<Record<string, unknown>>
      }
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []

  const models = rawModels
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const id =
        readModelText(record.id) ||
        readModelText(record.name) ||
        readModelText(record.model)
      if (!id) return null
      const provider =
        readModelText(record.provider) ||
        readModelText(record.owned_by) ||
        (id.includes('/') ? id.split('/')[0] : 'claude-agent')

      return {
        ...record,
        id,
        provider,
        name:
          readModelText(record.name) ||
          readModelText(record.display_name) ||
          readModelText(record.label) ||
          id,
      }
    })
    .filter(isClaudeCatalogEntry)

  const configuredProviders = Array.from(
    new Set(
      models.flatMap((entry) => {
        if (typeof entry === 'string') return []
        return typeof entry.provider === 'string' && entry.provider
          ? [entry.provider]
          : []
      }),
    ),
  )

  return {
    ok: true,
    models: models as Array<ModelCatalogEntry>,
    configuredProviders,
  }
}

async function fetchModelsForProvider(
  provider: string,
): Promise<Array<ModelCatalogEntry>> {
  const normalizedProvider = provider.trim()
  if (!normalizedProvider) return []

  const response = await fetch(
    `/api/claude-proxy/api/available-models?provider=${encodeURIComponent(normalizedProvider)}`,
  )
  if (!response.ok) {
    throw new Error(`Claude models request failed (${response.status})`)
  }

  const payload = (await response.json()) as ClaudeAvailableModelsResponse
  return (payload.models || []).map((model) => ({
    id: model.id,
    name: model.id,
    provider: normalizedProvider,
  }))
}

import { setLocalModelOverride } from '../chat-screen'

const LOCAL_PROVIDERS_SET = new Set(['ollama', 'atomic-chat'])

async function switchModel(
  model: string,
  provider?: string,
  _sessionKey?: string,
): Promise<ModelSwitchResponse> {
  const modelId = model.trim()
  const modelProvider =
    typeof provider === 'string' && provider.trim()
      ? provider.trim()
      : modelId.includes('/')
        ? modelId.split('/')[0]
        : undefined

  // For local providers, don't write to gateway config — just track client-side.
  // The gateway can't run local models (context too small for agent loop).
  if (modelProvider && LOCAL_PROVIDERS_SET.has(modelProvider)) {
    setLocalModelOverride(`${modelProvider}/${modelId}`)
    return {
      ok: true,
      resolved: {
        modelProvider,
        model: modelId,
      },
    }
  }
  // Switching to a cloud model — clear any local override
  setLocalModelOverride('')

  // Write the model change to ~/.claude/config.yaml via the webapi
  const patch: Record<string, string> = { model: modelId }
  if (modelProvider) patch.provider = modelProvider

  const response = await fetch('/api/claude-proxy/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }

  return {
    ok: true,
    resolved: {
      modelProvider: modelProvider || 'claude-agent',
      model: modelId,
    },
  }
}

/** Maximum file size accepted from picker/drop before processing (50MB). */
const MAX_ATTACHMENT_FILE_SIZE = 50 * 1024 * 1024
/** Longest side target for resized images. */
const MAX_IMAGE_DIMENSION = 1920
/** Initial JPEG compression quality (0-1). */
const IMAGE_QUALITY = 0.85
/** Safe image attachment limit after processing (1MB). */
const MAX_TRANSPORT_IMAGE_SIZE = 1 * 1024 * 1024

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

const TEXT_EXTENSION_TO_MIME: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  ts: 'text/plain',
  tsx: 'text/plain',
  js: 'text/plain',
  py: 'text/plain',
}

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase()
}

function isImageMimeType(value: string): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('image/')
}

function inferImageMimeTypeFromFileName(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  if (!match?.[1]) return ''
  return IMAGE_EXTENSION_TO_MIME[match[1].toLowerCase()] || ''
}

function inferTextMimeTypeFromFileName(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  if (!match?.[1]) return ''
  return TEXT_EXTENSION_TO_MIME[match[1].toLowerCase()] || ''
}

function isTextMimeType(value: string): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('text/') || normalized === 'application/json'
}

function isImageFile(file: File): boolean {
  if (isImageMimeType(file.type)) return true
  return inferImageMimeTypeFromFileName(file.name).length > 0
}

function isTextFile(file: File): boolean {
  if (isTextMimeType(file.type)) return true
  return inferTextMimeTypeFromFileName(file.name).length > 0
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

function hasAttachableData(dt: DataTransfer | null): boolean {
  if (!dt) return false
  const items = Array.from(dt.items)
  if (
    items.some(
      (item) =>
        item.kind === 'file' &&
        (isImageMimeType(item.type) ||
          isTextMimeType(item.type) ||
          item.type.trim().length === 0),
    )
  )
    return true
  const files = Array.from(dt.files)
  return files.some(
    (file) =>
      isImageFile(file) || isTextFile(file) || file.type.trim().length === 0,
  )
}

function collectFilesFromDataTransfer(dt: DataTransfer | null): Array<File> {
  if (!dt) return []
  const files: Array<File> = []
  const seen = new Set<string>()

  const pushFile = (file: File | null) => {
    if (!file) return
    const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`
    if (seen.has(key)) return
    seen.add(key)
    files.push(file)
  }

  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    pushFile(item.getAsFile())
  }

  for (const file of Array.from(dt.files)) {
    pushFile(file)
  }

  return files
}

async function readFileAsDataUrl(file: File): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

async function readFileAsText(file: File): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsText(file)
  })
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getResolvedModelKey(model: string, provider?: string): string {
  const normalizedModel = model.trim()
  const normalizedProvider = typeof provider === 'string' ? provider.trim() : ''

  if (!normalizedModel) return ''
  if (!normalizedProvider) return normalizedModel
  if (normalizedModel.startsWith(`${normalizedProvider}/`))
    return normalizedModel
  return `${normalizedProvider}/${normalizedModel}`
}

function isCanvasSupported(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('2d'))
  } catch {
    return false
  }
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
  if (!base64) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function readDataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:([^;]+);base64,/.exec(dataUrl)
  return match?.[1]?.trim() || null
}

async function compressImageToDataUrl(file: File): Promise<string> {
  if (!isCanvasSupported()) {
    throw new Error('Image compression not available')
  }

  return await new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    image.onload = () => {
      try {
        let width = image.width
        let height = image.height

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width)
            width = MAX_IMAGE_DIMENSION
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height)
            height = MAX_IMAGE_DIMENSION
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          cleanup()
          reject(new Error('Failed to get canvas context'))
          return
        }

        context.drawImage(image, 0, 0, width, height)

        let quality = IMAGE_QUALITY
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        let bytes = estimateDataUrlBytes(dataUrl)

        while (bytes > MAX_TRANSPORT_IMAGE_SIZE && quality > 0.4) {
          quality -= 0.08
          dataUrl = canvas.toDataURL('image/jpeg', quality)
          bytes = estimateDataUrlBytes(dataUrl)
        }

        cleanup()
        resolve(dataUrl)
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error('Compression failed'))
      }
    }

    image.onerror = () => {
      cleanup()
      reject(new Error('Failed to load image'))
    }

    image.src = objectUrl
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readModelFromStatusPayload(payload: unknown): string {
  if (!isRecord(payload)) return ''

  const directCandidates = [
    payload.model,
    payload.currentModel,
    payload.modelAlias,
  ]
  for (const candidate of directCandidates) {
    const text = readText(candidate)
    if (text) return text
  }

  if (isRecord(payload.resolved)) {
    const provider = readText(payload.resolved.modelProvider)
    const model = readText(payload.resolved.model)
    if (provider && model) return `${provider}/${model}`
    if (model) return model
  }

  const nestedCandidates = [payload.status, payload.session, payload.payload]
  for (const nested of nestedCandidates) {
    const nestedModel = readModelFromStatusPayload(nested)
    if (nestedModel) return nestedModel
  }

  return ''
}

function normalizeDraftSessionKey(sessionKey?: string): string {
  if (typeof sessionKey !== 'string') return 'new'
  const normalized = sessionKey.trim()
  return normalized.length > 0 ? normalized : 'new'
}

function toDraftStorageKey(sessionKey?: string): string {
  return `claude-draft-${normalizeDraftSessionKey(sessionKey)}`
}

function readSlashCommandQuery(inputValue: string): string | null {
  if (!inputValue.startsWith('/')) return null
  const newlineIndex = inputValue.indexOf('\n')
  const firstLine =
    newlineIndex === -1 ? inputValue : inputValue.slice(0, newlineIndex)
  if (/\s/.test(firstLine.slice(1))) return null
  return firstLine.slice(1)
}

function isTimeoutErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('timed out') || normalized.includes('timeout')
}

async function readResponseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
    return JSON.stringify(payload)
  } catch {
    const text = await response.text().catch(() => '')
    return text || response.statusText || 'Request failed'
  }
}

async function fetchCurrentModelFromStatus(): Promise<string> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 7000)

  try {
    const response = await fetch('/api/session-status', {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    const payload = (await response.json()) as SessionStatusApiResponse
    if (payload.ok === false) {
      throw new Error(readText(payload.error) || 'Server unavailable')
    }

    return readModelFromStatusPayload(payload.payload ?? payload)
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function fetchGatewayMode(): Promise<string | null> {
  const response = await fetch('/api/gateway-status')
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  const payload = (await response.json()) as GatewayStatusApiResponse
  return typeof payload.mode === 'string' ? payload.mode : null
}

async function fetchModelInfo(): Promise<ModelInfoApiResponse | null> {
  const response = await fetch('/api/model/info')
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  return (await response.json()) as ModelInfoApiResponse
}

function focusPromptTarget(target: HTMLTextAreaElement | null) {
  if (!target) return
  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
  }
}

function ChatComposerComponent({
  onSubmit,
  isLoading,
  disabled,
  sessionKey,
  wrapperRef,
  composerRef,
  focusKey,
  onNewSession,
  onToggleWebSearch: _onToggleWebSearch,
  webSearchEnabled,
  thinkingLevel: externalThinkingLevel,
  onThinkingLevelChange,
  onAbort,
  embedded = false,
  hideModelSelector = false,
}: ChatComposerProps) {
  const mobileKeyboardInset = useWorkspaceStore((s) => s.mobileKeyboardInset)
  const mobileComposerFocused = useWorkspaceStore(
    (s) => s.mobileComposerFocused,
  )
  const setMobileKeyboardOpen = useWorkspaceStore(
    (s) => s.setMobileKeyboardOpen,
  )
  const setMobileKeyboardInset = useWorkspaceStore(
    (s) => s.setMobileKeyboardInset,
  )
  const setMobileComposerFocused = useWorkspaceStore(
    (s) => s.setMobileComposerFocused,
  )
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Array<ChatComposerAttachment>>(
    [],
  )
  const [attachmentProcessingCount, setAttachmentProcessingCount] = useState(0)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [previewImage, setPreviewImage] = useState<{
    url: string
    name: string
  } | null>(null)
  const [focusAfterSubmitTick, setFocusAfterSubmitTick] = useState(0)
  const { settings: composerSettings } = useSettings()
  const chatNavMode = composerSettings.mobileChatNavMode ?? 'dock'
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [isProviderSwitcherExpanded, setIsProviderSwitcherExpanded] =
    useState(false)
  const [isMobileActionsMenuOpen, setIsMobileActionsMenuOpen] = useState(false)
  const [isWebSearchMode, _setIsWebSearchMode] = useState(false)
  const [isSlashMenuDismissed, setIsSlashMenuDismissed] = useState(false)
  const [modelNotice, setModelNotice] = useState<ModelSwitchNotice | null>(null)
  const [fastMode, setFastMode] = useState(false)
  // Per-session thinking level — controlled externally (chat-screen owns the state)
  // Falls back to internal state if no external controller provided
  const [internalThinkingLevel, setInternalThinkingLevel] =
    useState<ThinkingLevel>('low')
  const thinkingLevel = externalThinkingLevel ?? internalThinkingLevel
  // Thinking toggle removed for Claude (not supported) — keeping state for type compat
  const _handleThinkingToggle = useCallback(() => {
    const next = nextThinkingLevel(thinkingLevel)
    if (onThinkingLevelChange) {
      onThinkingLevelChange(next)
    } else {
      setInternalThinkingLevel(next)
    }
  }, [thinkingLevel, onThinkingLevelChange])
  void _handleThinkingToggle
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const slashMenuRef = useRef<SlashCommandMenuHandle | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const dragCounterRef = useRef(0)
  const shouldRefocusAfterSendRef = useRef(false)
  const submittingRef = useRef(false)
  const pendingSubmitAfterAttachmentsRef = useRef(false)
  const modelSelectorRef = useRef<HTMLDivElement | null>(null)
  const composerWrapperRef = useRef<HTMLDivElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)

  // Phase 4.2: Pinned models (kept for future use)
  const { pinned, isPinned, togglePin } = usePinnedModels()

  const modelsQuery = useQuery({
    queryKey: ['claude', 'models'],
    queryFn: fetchModels,
    refetchInterval: 60_000,
    retry: false,
  })
  const currentProvider = modelsQuery.data?.currentProvider ?? ''
  const otherProviders = useMemo(
    () =>
      (modelsQuery.data?.providers ?? []).filter(
        (provider) => provider.id !== currentProvider,
      ),
    [currentProvider, modelsQuery.data?.providers],
  )
  const otherProviderModelsQuery = useQuery({
    queryKey: [
      'claude',
      'models',
      'other-providers',
      otherProviders
        .map((provider) => provider.id)
        .sort()
        .join('|'),
    ],
    enabled: isProviderSwitcherExpanded && otherProviders.length > 0,
    retry: false,
    queryFn: async () => {
      const modelEntries = await Promise.all(
        otherProviders.map(async (provider) => ({
          providerId: provider.id,
          models: await fetchModelsForProvider(provider.id),
        })),
      )

      return modelEntries.reduce<Record<string, Array<ModelCatalogEntry>>>(
        (acc, entry) => {
          acc[entry.providerId] = entry.models
          return acc
        },
        {},
      )
    },
  })
  const currentModelQuery = useQuery({
    queryKey: ['claude', 'session-status-model'],
    queryFn: fetchCurrentModelFromStatus,
    refetchInterval: 30_000,
    retry: false,
  })
  const gatewayModeQuery = useQuery({
    queryKey: ['gateway-status', 'mode'],
    queryFn: fetchGatewayMode,
    staleTime: 30_000,
    retry: false,
  })
  const modelInfoQuery = useQuery({
    queryKey: ['dashboard', 'model-info'],
    queryFn: fetchModelInfo,
    staleTime: 30_000,
    retry: false,
  })
  const zeroForkModelInfoFlags = useMemo(
    () => getZeroForkModelInfoFlags(modelInfoQuery.data),
    [modelInfoQuery.data],
  )

  // Phase 4.2: (pinned model tracking kept for future use)
  void modelsQuery.data

  const modelSwitchMutation = useMutation({
    mutationFn: async function doSwitchModel(payload: {
      model: string
      provider?: string
      sessionKey?: string
    }) {
      return await switchModel(
        payload.model,
        payload.provider,
        payload.sessionKey,
      )
    },
    onSuccess: function onSuccess(payload: ModelSwitchResponse, variables) {
      const provider = readText(payload.resolved?.modelProvider)
      const model = readText(payload.resolved?.model)
      const resolvedModel =
        provider && model ? `${provider}/${model}` : model || variables.model
      setModelNotice({
        tone: 'success',
        message: `Model switched to ${resolvedModel}`,
      })
      setIsModelMenuOpen(false)
      void currentModelQuery.refetch()
    },
    onError: function onError(error, variables) {
      const message = error instanceof Error ? error.message : String(error)
      if (isTimeoutErrorMessage(message)) {
        setModelNotice({
          tone: 'error',
          message: 'Request timed out',
          retryModel: variables.model,
          retryProvider: variables.provider,
        })
        return
      }
      setModelNotice({
        tone: 'error',
        message: message || 'Failed to switch model',
        retryModel: variables.model,
        retryProvider: variables.provider,
      })
    },
  })

  const handleModelSelect = useCallback(
    function handleModelSelect(nextModel: string, provider?: string) {
      const model = nextModel.trim()
      if (!model) return
      const normalizedSessionKey =
        typeof sessionKey === 'string' && sessionKey.trim().length > 0
          ? sessionKey.trim()
          : undefined
      if (
        shouldBlockZeroForkModelSwitch(
          gatewayModeQuery.data,
          zeroForkModelInfoFlags,
        )
      ) {
        toast(MODEL_SWITCH_BLOCKED_TOAST)
        setIsModelMenuOpen(false)
        return
      }
      setModelNotice(null)
      setCurrentSelectedModel(getResolvedModelKey(model, provider))
      modelSwitchMutation.mutate({
        model,
        provider,
        sessionKey: normalizedSessionKey,
      })
    },
    [
      gatewayModeQuery.data,
      modelSwitchMutation,
      sessionKey,
      zeroForkModelInfoFlags,
    ],
  )

  const retryModel = modelNotice?.retryModel ?? ''
  const retryProvider = modelNotice?.retryProvider
  const handleRetryModelSwitch = useCallback(
    function handleRetryModelSwitch() {
      if (!retryModel) return
      handleModelSelect(retryModel, retryProvider)
    },
    [handleModelSelect, retryModel, retryProvider],
  )

  const currentModel = currentModelQuery.data ?? ''

  // Auto-switch to claude-agent model on mount (Claude Workspace always uses Claude)
  // Removed: auto-switch to claude-agent. The workspace respects the
  // model/provider configured in ~/.claude/config.yaml. Users switch
  // via the model selector or Settings page.

  // When model switches to Claude 4.6 and thinking is 'off', auto-upgrade to 'adaptive'
  const prevModelRef = useRef('')
  useEffect(() => {
    if (!currentModel || currentModel === prevModelRef.current) return
    prevModelRef.current = currentModel
    if (isClaude46Model(currentModel) && thinkingLevel === 'off') {
      if (onThinkingLevelChange) {
        onThinkingLevelChange('adaptive')
      } else {
        setInternalThinkingLevel('adaptive')
      }
    }
  }, [currentModel, thinkingLevel, onThinkingLevelChange])

  const isModelSwitcherDisabled = disabled || modelSwitchMutation.isPending
  const draftStorageKey = useMemo(
    () => toDraftStorageKey(sessionKey),
    [sessionKey],
  )
  const [currentSelectedModel, setCurrentSelectedModel] = useState<
    string | null
  >(null)
  // On new chat, currentModel is empty until a session is created.
  // Read the runtime model from the models query (first item is from the current provider).
  const configuredModel = useMemo(() => {
    const models = modelsQuery.data?.models ?? []
    if (!models.length) return ''
    const first = models[0]
    return typeof first === 'string' ? first : first.id || first.name || ''
  }, [modelsQuery.data])
  const modelButtonLabel =
    currentSelectedModel || currentModel || configuredModel || '⚕ Hermes Agent'

  // Measure composer height and set CSS variable for scroll padding
  useLayoutEffect(() => {
    const wrapper = composerWrapperRef.current
    if (!wrapper) return

    const updateHeight = () => {
      const height = wrapper.offsetHeight
      if (height > 0) {
        document.documentElement.style.setProperty(
          '--chat-composer-height',
          `${height}px`,
        )
      }
    }

    updateHeight()

    // Use ResizeObserver to track height changes (e.g., when textarea grows)
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(wrapper)

    return () => {
      resizeObserver.disconnect()
    }
  }, [attachments.length, value])

  const cancelFocusPromptFrame = useCallback(function cancelFocusPromptFrame() {
    if (focusFrameRef.current === null) return
    window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = null
  }, [])

  const focusPrompt = useCallback(
    function focusPrompt() {
      if (typeof window === 'undefined') return
      cancelFocusPromptFrame()
      focusFrameRef.current = window.requestAnimationFrame(
        function focusPromptInFrame() {
          focusFrameRef.current = null
          focusPromptTarget(promptRef.current)
        },
      )
    },
    [cancelFocusPromptFrame],
  )

  useEffect(
    function cleanupFocusPromptFrameOnUnmount() {
      return function cleanupFocusPromptFrame() {
        cancelFocusPromptFrame()
      }
    },
    [cancelFocusPromptFrame],
  )

  useEffect(
    function cleanupMobileComposerFocusOnUnmount() {
      return function cleanupMobileComposerFocus() {
        setMobileComposerFocused(false)
      }
    },
    [setMobileComposerFocused],
  )

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0
    setIsDraggingOver(false)
  }, [])

  useLayoutEffect(() => {
    if (isMobileViewport) return
    focusPrompt()
  }, [focusPrompt, isMobileViewport])

  useLayoutEffect(() => {
    if (disabled) return
    if (!shouldRefocusAfterSendRef.current) return
    shouldRefocusAfterSendRef.current = false
    focusPrompt()
  }, [disabled, focusPrompt])

  useLayoutEffect(() => {
    if (focusAfterSubmitTick === 0) return
    focusPrompt()
  }, [focusAfterSubmitTick, focusPrompt])

  useLayoutEffect(() => {
    if (disabled) return
    if (isMobileViewport) return
    // Only focus on focusKey change (session switch), not on every disabled toggle
    focusPrompt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, isMobileViewport])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 767px)')
    const updateIsMobile = () => setIsMobileViewport(media.matches)
    updateIsMobile()
    media.addEventListener('change', updateIsMobile)
    return () => media.removeEventListener('change', updateIsMobile)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedDraft = window.sessionStorage.getItem(draftStorageKey)
    setValue(savedDraft ?? '')
  }, [draftStorageKey])

  useEffect(() => {
    if (!isModelMenuOpen) return
    function handleOutsideClick(event: MouseEvent) {
      if (!modelSelectorRef.current) return
      if (modelSelectorRef.current.contains(event.target as Node)) return
      setIsModelMenuOpen(false)
      setIsProviderSwitcherExpanded(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isModelMenuOpen])

  const persistDraft = useCallback(
    function persistDraft(nextValue: string) {
      if (typeof window === 'undefined') return
      if (nextValue.length === 0) {
        window.sessionStorage.removeItem(draftStorageKey)
        return
      }
      window.sessionStorage.setItem(draftStorageKey, nextValue)
    },
    [draftStorageKey],
  )

  const clearDraft = useCallback(
    function clearDraft() {
      if (typeof window === 'undefined') return
      window.sessionStorage.removeItem(draftStorageKey)
    },
    [draftStorageKey],
  )

  const handleValueChange = useCallback(
    function handleValueChange(nextValue: string) {
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
    },
    [persistDraft],
  )

  const reset = useCallback(() => {
    setIsSlashMenuDismissed(false)
    setValue('')
    clearDraft()
    setAttachments([])
    resetDragState()
    focusPrompt()
  }, [clearDraft, focusPrompt, resetDragState])

  const setComposerValue = useCallback(
    (nextValue: string) => {
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
      focusPrompt()
    },
    [focusPrompt, persistDraft],
  )

  const setComposerAttachments = useCallback(
    (nextAttachments: Array<ChatComposerAttachment>) => {
      setAttachments(nextAttachments)
      focusPrompt()
    },
    [focusPrompt],
  )

  const insertText = useCallback(
    (text: string) => {
      setIsSlashMenuDismissed(false)
      setValue((prev) => {
        const nextValue = prev.trim().length > 0 ? `${prev}\n${text}` : text
        persistDraft(nextValue)
        return nextValue
      })
      focusPrompt()
    },
    [focusPrompt, persistDraft],
  )

  useImperativeHandle(
    composerRef,
    () => ({ setValue: setComposerValue, insertText }),
    [insertText, setComposerValue],
  )

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }, [])

  const addAttachments = useCallback(
    async (files: Array<File>) => {
      if (disabled) return
      setAttachmentProcessingCount((n) => n + 1)

      const timestamp = Date.now()
      const prepared = await Promise.all(
        files.map(
          async (file, index): Promise<ChatComposerAttachment | null> => {
            const imageFile = isImageFile(file)
            const textFile = isTextFile(file)
            if (!imageFile && !textFile && file.type.trim().length > 0) {
              return null
            }

            if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
              toast(
                `“${file.name || 'file'}” is ${formatFileSize(file.size)}. Max upload input size is ${formatFileSize(MAX_ATTACHMENT_FILE_SIZE)}.`,
                { type: 'warning' },
              )
              return null
            }

            if (textFile) {
              const textContent = await readFileAsText(file)
              if (textContent === null) return null
              const name =
                file.name && file.name.trim().length > 0
                  ? file.name.trim()
                  : `pasted-text-${timestamp}-${index + 1}.txt`
              const textBytes = new TextEncoder().encode(textContent).length
              return {
                id: crypto.randomUUID(),
                name,
                contentType:
                  (isTextMimeType(file.type)
                    ? normalizeMimeType(file.type)
                    : '') ||
                  inferTextMimeTypeFromFileName(name) ||
                  'text/plain',
                size: textBytes,
                dataUrl: textContent,
                kind: 'file',
              }
            }

            const compressedDataUrl = await compressImageToDataUrl(file).catch(
              () => null,
            )
            const dataUrl = compressedDataUrl || (await readFileAsDataUrl(file))
            if (!dataUrl) return null

            const dataUrlMimeType = readDataUrlMimeType(dataUrl)
            if (!isImageMimeType(dataUrlMimeType || '')) {
              return null
            }

            const transportBytes = estimateDataUrlBytes(dataUrl)
            if (transportBytes > MAX_TRANSPORT_IMAGE_SIZE) {
              toast(
                `Image compressed to ${(transportBytes / (1024 * 1024)).toFixed(2)}mb — still over the 1mb limit. Try a smaller screenshot.`,
                { type: 'warning' },
              )
              return null
            }

            const name =
              file.name && file.name.trim().length > 0
                ? file.name.trim()
                : `pasted-image-${timestamp}-${index + 1}.jpg`
            const detectedMimeType =
              dataUrlMimeType ||
              (isImageMimeType(file.type)
                ? normalizeMimeType(file.type)
                : '') ||
              inferImageMimeTypeFromFileName(name) ||
              'image/jpeg'
            return {
              id: crypto.randomUUID(),
              name,
              contentType: detectedMimeType,
              size: transportBytes,
              dataUrl,
              previewUrl: dataUrl,
              kind: 'image',
            }
          },
        ),
      )

      const valid = prepared.filter(
        (attachment): attachment is ChatComposerAttachment =>
          attachment !== null,
      )

      const skippedCount = prepared.length - valid.length
      if (skippedCount > 0) {
        toast(
          skippedCount === 1
            ? '1 file could not be attached.'
            : `${skippedCount} files could not be attached.`,
          { type: 'warning' },
        )
      }

      if (valid.length === 0) {
        setAttachmentProcessingCount((n) => Math.max(0, n - 1))
        return
      }

      setAttachments((prev) => [...prev, ...valid])
      setAttachmentProcessingCount((n) => Math.max(0, n - 1))
      focusPrompt()
    },
    [disabled, focusPrompt],
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const files = collectFilesFromDataTransfer(event.clipboardData)
      if (files.length === 0) return

      const text = event.clipboardData.getData('text/plain')
      if (text.trim().length === 0) {
        event.preventDefault()
      }
      void addAttachments(files)
    },
    [addAttachments, disabled],
  )

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      if (!hasAttachableData(event.dataTransfer)) return
      event.preventDefault()
      dragCounterRef.current += 1
      setIsDraggingOver(true)
      event.dataTransfer.dropEffect = 'copy'
    },
    [disabled],
  )

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      if (event.currentTarget.contains(event.relatedTarget as Node)) return
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) {
        setIsDraggingOver(false)
      }
    },
    [disabled],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      if (hasAttachableData(event.dataTransfer)) {
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    [disabled],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      const files = collectFilesFromDataTransfer(event.dataTransfer)
      resetDragState()
      if (files.length === 0) return
      void addAttachments(files)
    },
    [addAttachments, disabled, resetDragState],
  )

  const handleSubmit = useCallback(() => {
    if (disabled) return
    if (submittingRef.current) return
    if (attachmentProcessingCount > 0) {
      // Queue a submit to fire once all attachments finish processing
      pendingSubmitAfterAttachmentsRef.current = true
      return
    }
    const body = value.trim()
    if (body.length === 0 && attachments.length === 0) return
    submittingRef.current = true
    const attachmentPayload = attachments.map((attachment) => ({
      ...attachment,
    }))
    try {
      // Fast mode is incompatible with extended thinking — disable if thinking is on
      const effectiveFastMode =
        fastMode && thinkingLevel === 'off' ? true : false
      onSubmit(body, attachmentPayload, effectiveFastMode, {
        reset,
        setValue: setComposerValue,
        setAttachments: setComposerAttachments,
      })
    } finally {
      // Reset after a tick so rapid re-fires (double-click, Enter+form submit) are blocked
      setTimeout(() => {
        submittingRef.current = false
      }, 300)
    }
    clearDraft()
    shouldRefocusAfterSendRef.current = true
    setFocusAfterSubmitTick((prev) => prev + 1)
    focusPrompt()
  }, [
    attachmentProcessingCount,
    attachments,
    clearDraft,
    disabled,
    focusPrompt,
    onSubmit,
    reset,
    setComposerAttachments,
    setComposerValue,
    value,
    fastMode,
  ])

  // Fire queued submit once all in-flight attachment processing finishes
  useEffect(() => {
    if (attachmentProcessingCount !== 0) return
    if (!pendingSubmitAfterAttachmentsRef.current) return
    pendingSubmitAfterAttachmentsRef.current = false
    handleSubmit()
  }, [attachmentProcessingCount, handleSubmit])

  // ⌘+Shift+M (Mac) / Ctrl+Shift+M (Win) to open model selector
  useEffect(() => {
    const handleModelShortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'm'
      ) {
        event.preventDefault()
        event.stopPropagation()
        setIsModelMenuOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleModelShortcut, true)
    return () =>
      window.removeEventListener('keydown', handleModelShortcut, true)
  }, [])

  const submitDisabled =
    disabled ||
    (value.trim().length === 0 &&
      attachments.length === 0 &&
      attachmentProcessingCount === 0)

  const hasDraft = value.trim().length > 0 || attachments.length > 0
  const promptPlaceholder = isMobileViewport
    ? 'Message...'
    : 'Ask anything... (↵ to send · ⇧↵ new line · ⌘⇧M switch model)'
  const slashCommandQuery = useMemo(() => readSlashCommandQuery(value), [value])
  const isSlashMenuOpen =
    slashCommandQuery !== null && !disabled && !isSlashMenuDismissed

  const handleClearDraft = useCallback(() => {
    reset()
  }, [reset])

  const _isWebSearchActive = webSearchEnabled ?? isWebSearchMode
  void _isWebSearchActive // retained for future use / external prop

  // Voice input (tap = speech-to-text)
  const voiceInput = useVoiceInput({
    onResult: useCallback(
      (text: string) => {
        if (!text.trim()) return
        setValue((prev) => {
          const next = prev.trim().length > 0 ? `${prev} ${text}` : text
          persistDraft(next)
          return next
        })
      },
      [persistDraft],
    ),
  })

  // Voice recorder (long-press = voice note)
  const voiceRecorder = useVoiceRecorder({
    onRecorded: useCallback(
      (blob: Blob, durationMs: number) => {
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4'
        const name = `voice-note-${Date.now()}.${ext}`
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : ''
          if (!dataUrl) return
          const secs = Math.round(durationMs / 1000)
          setAttachments((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name,
              contentType: blob.type || 'audio/webm',
              size: blob.size,
              dataUrl,
              previewUrl: '',
            },
          ])
          // Auto-add duration caption to message
          setValue((prev) => {
            const caption = `🎤 Voice note (${secs}s)`
            const next =
              prev.trim().length > 0 ? `${prev}\n${caption}` : caption
            persistDraft(next)
            return next
          })
        }
        reader.readAsDataURL(blob)
      },
      [persistDraft],
    ),
  })

  // Long-press detection for mic button
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressRef = useRef(false)
  const handleMicPointerDown = useCallback(() => {
    isLongPressRef.current = false
    // Start long-press timer for voice note recording (only if not already doing voice-to-text)
    if (!voiceInput.isListening && !voiceRecorder.isRecording) {
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true
        voiceRecorder.start()
      }, 500)
    }
  }, [voiceRecorder, voiceInput.isListening])
  const handleMicPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (isLongPressRef.current) {
      // Was a long press — stop voice note recording
      voiceRecorder.stop()
      isLongPressRef.current = false
    }
    // Short taps are handled by onClick for voice-to-text toggle
  }, [voiceRecorder])

  const handleAbort = useCallback(
    function handleAbort() {
      onAbort?.()
    },
    [onAbort],
  )

  const handleOpenAttachmentPicker = useCallback(
    function handleOpenAttachmentPicker(
      event: React.MouseEvent<HTMLButtonElement>,
    ) {
      event.preventDefault()
      if (disabled) return
      attachmentInputRef.current?.click()
    },
    [disabled],
  )

  const handleAttachmentInputChange = useCallback(
    function handleAttachmentInputChange(
      event: React.ChangeEvent<HTMLInputElement>,
    ) {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      setIsMobileActionsMenuOpen(false)
      if (files.length === 0) return
      void addAttachments(files)
    },
    [addAttachments],
  )

  const handleSelectSlashCommand = useCallback(
    function handleSelectSlashCommand(command: SlashCommandDefinition) {
      if (command.command === '/fast') {
        setIsSlashMenuDismissed(false)
        setFastMode((previous) => !previous)
        setValue('')
        persistDraft('')
        focusPrompt()
        return
      }

      const nextValue = `${command.command} `
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
      focusPrompt()
    },
    [focusPrompt, persistDraft],
  )

  const handleDismissSlashMenu = useCallback(() => {
    setIsSlashMenuDismissed(true)
  }, [])

  const handlePromptSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (isSlashMenuOpen) {
        const applied = slashMenuRef.current?.selectActive() ?? false
        if (!applied) {
          setIsSlashMenuDismissed(true)
        }
        return
      }
      handleSubmit()
    },
    [handleSubmit, isSlashMenuOpen],
  )

  const handlePromptKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash menu navigation takes priority
      if (isSlashMenuOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          slashMenuRef.current?.moveSelection(1)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          slashMenuRef.current?.moveSelection(-1)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          handleDismissSlashMenu()
          return
        }
      }
      // Enter-to-send is handled by PromptInputTextarea via the onSubmit prop.
      // Handling it here too causes handleSubmit() to fire twice on every Enter
      // keypress (once via onSubmit → handlePromptSubmit, once via this onKeyDown
      // handler), which duplicates messages when text is pasted then sent.
    },
    [handleDismissSlashMenu, isSlashMenuOpen],
  )

  // Combine internal ref with external wrapperRef
  const setWrapperRefs = useCallback(
    (node: HTMLDivElement | null) => {
      composerWrapperRef.current = node
      if (typeof wrapperRef === 'function') {
        wrapperRef(node)
      } else if (wrapperRef && 'current' in wrapperRef) {
        ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node
      }
    },
    [wrapperRef],
  )

  const keyboardOrFocusActive = mobileKeyboardInset > 0 || mobileComposerFocused

  // Scroll-hide: hide composer when user scrolls up (reading older messages).
  // Re-show when user scrolls down or reaches the bottom.
  const [scrollHidden, setScrollHidden] = useState(false)
  // Reset scroll-hide state when session changes (prevents composer staying hidden when navigating)
  const prevSessionKeyRef = useRef<string | undefined>(undefined)
  if (prevSessionKeyRef.current !== sessionKey) {
    prevSessionKeyRef.current = sessionKey
    if (scrollHidden) setScrollHidden(false)
  }
  useEffect(() => {
    if (!isMobileViewport) return
    let lastScrollTop = 0
    let accumulated = 0
    const THRESHOLD = 40

    const handleScroll = () => {
      const viewport = document.querySelector('[data-chat-scroll-viewport]')
      if (!(viewport instanceof HTMLElement)) return
      const scrollTop = viewport.scrollTop
      const maxScroll = viewport.scrollHeight - viewport.clientHeight
      const delta = scrollTop - lastScrollTop
      lastScrollTop = scrollTop

      // Always show near bottom
      if (maxScroll - scrollTop < 64) {
        accumulated = 0
        setScrollHidden(false)
        return
      }

      if (delta < 0) {
        accumulated += Math.abs(delta)
        if (accumulated >= THRESHOLD) {
          setScrollHidden(true)
        }
      } else if (delta > 0) {
        accumulated = 0
        setScrollHidden(false)
      }
    }

    // Attach to the viewport once it's in the DOM
    const attach = () => {
      const viewport = document.querySelector('[data-chat-scroll-viewport]')
      if (viewport instanceof HTMLElement) {
        viewport.addEventListener('scroll', handleScroll, { passive: true })
        return viewport
      }
      return null
    }

    // Retry attachment if viewport not yet rendered
    let viewport = attach()
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    if (!viewport) {
      retryTimer = setTimeout(() => {
        viewport = attach()
      }, 500)
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      viewport?.removeEventListener('scroll', handleScroll)
    }
  }, [isMobileViewport])

  // Always show composer when keyboard/focus is active
  const effectiveScrollHidden = scrollHidden && !keyboardOrFocusActive

  const composerWrapperStyle = useMemo(() => {
    const chatContentMaxWidth = 'min(var(--chat-content-max-width), 100%)'
    if (!isMobileViewport || embedded)
      return { maxWidth: chatContentMaxWidth } as CSSProperties
    const safeArea = 'env(safe-area-inset-bottom, 0px)'
    const tabBarH = 'var(--tabbar-h, 0px)'
    const tf = effectiveScrollHidden ? 'translateY(110%)' : 'translateY(0)'

    if (keyboardOrFocusActive) {
      // All modes: keyboard up = flush at bottom with keyboard inset
      return {
        maxWidth: 'min(768px, 100%)',
        bottom: '0px',
        paddingBottom: `calc(var(--kb-inset, 0px))`,
        transform: tf,
        WebkitTransform: tf,
        '--mobile-tab-bar-offset': MOBILE_TAB_BAR_OFFSET,
      } as CSSProperties
    }

    if (chatNavMode === 'dock') {
      // iMessage mode: tab bar hidden, composer docks to bottom with safe area only
      return {
        maxWidth: 'min(768px, 100%)',
        bottom: '0px',
        paddingBottom: `max(var(--safe-b, 0px), ${safeArea})`,
        transform: tf,
        WebkitTransform: tf,
        '--mobile-tab-bar-offset': MOBILE_TAB_BAR_OFFSET,
      } as CSSProperties
    }

    // scroll-hide / integrated: tab bar visible, composer sits above it
    return {
      maxWidth: 'min(768px, 100%)',
      bottom: `calc(${tabBarH} + 4px)`,
      paddingBottom: '0px',
      transform: tf,
      WebkitTransform: tf,
      '--mobile-tab-bar-offset': MOBILE_TAB_BAR_OFFSET,
    } as CSSProperties
  }, [isMobileViewport, keyboardOrFocusActive, effectiveScrollHidden, embedded])

  return (
    <div
      className={cn(
        'no-swipe pointer-events-auto touch-manipulation',
        isMobileViewport
          ? embedded
            ? [
                // Embedded mobile composer: stay inside the card, no fixed bottom.
                'relative z-40 w-full',
                'bg-surface border-t border-primary-200/60',
              ].join(' ')
            : [
                'fixed z-[70] transition-all duration-200',
                chatNavMode === 'dock'
                  ? [
                      // iMessage-style: edge-to-edge, docked to bottom
                      'left-0 right-0',
                      'bg-surface/95 backdrop-blur-xl',
                      'border-t border-primary-200/60',
                    ].join(' ')
                  : [
                      // scroll-hide / integrated: floating pill above tab bar
                      'left-4 right-4',
                      'bg-surface/95 backdrop-blur-2xl',
                      'shadow-[0_8px_32px_rgba(0,0,0,0.15)]',
                      'rounded-[22px]',
                    ].join(' '),
              ].join(' ')
          : [
              'relative z-40 shrink-0 w-full mx-auto px-3 pt-2 sm:px-5',
              'bg-surface',
            ].join(' '),
        // Mobile: pin above tab bar + safe-area inset. Desktop: normal bottom padding.
        !isMobileViewport
          ? 'pb-[max(var(--safe-b),8px)] md:pb-[calc(var(--safe-b)+0.75rem)]'
          : '',
        'md:bg-surface/95 md:backdrop-blur md:transition-[padding-bottom,background-color,backdrop-filter] md:duration-200',
      )}
      style={composerWrapperStyle}
      ref={setWrapperRefs}
    >
      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*,.md,.txt,.json,.csv,.ts,.tsx,.js,.py"
        multiple
        className="hidden"
        onChange={handleAttachmentInputChange}
      />
      <PromptInput
        value={value}
        onValueChange={handleValueChange}
        onSubmit={handlePromptSubmit}
        isLoading={isLoading}
        disabled={disabled}
        maxHeight={isMobileViewport ? 120 : 240}
        className={cn(
          'relative z-50 transition-all duration-300',
          // On mobile: remove PromptInput's built-in rounded/bg/padding — outer wrapper owns the container
          isMobileViewport &&
            'py-0 gap-0 !rounded-none !bg-transparent shadow-none outline-none',
          isDraggingOver &&
            'outline-primary-500 ring-2 ring-primary-300 bg-primary-50/80',
          isLoading &&
            'ring-2 ring-accent-400/70 shadow-[0_0_20px_rgba(48,80,255,0.35)] animate-pulse-glow',
        )}
        onPaste={handlePaste}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <SlashCommandMenu
          ref={slashMenuRef}
          open={isSlashMenuOpen}
          query={slashCommandQuery ?? ''}
          onSelect={handleSelectSlashCommand}
        />

        {isDraggingOver ? (
          <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[18px] border-2 border-dashed border-primary-400 bg-primary-50/90 text-sm font-medium text-primary-700">
            Drop files to attach
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="px-3">
            <div className="flex flex-wrap gap-3">
              {attachments.map((attachment) => {
                const isImageAttachment =
                  Boolean(attachment.previewUrl) &&
                  isImageMimeType(attachment.contentType)

                return (
                  <div
                    key={attachment.id}
                    className={cn(
                      'group relative',
                      isImageAttachment ? 'w-28' : 'w-auto max-w-[16rem]',
                    )}
                  >
                    {isImageAttachment ? (
                      <button
                        type="button"
                        className="aspect-square w-full overflow-hidden rounded-xl border border-primary-200 bg-primary-50"
                        onClick={() =>
                          setPreviewImage({
                            url: attachment.previewUrl || '',
                            name: attachment.name || 'Attached image',
                          })
                        }
                        aria-label={`Preview ${attachment.name || 'image'}`}
                      >
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name || 'Attached image'}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">
                        <span className="mr-1">📄</span>
                        <span className="truncate">{attachment.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleRemoveAttachment(attachment.id)
                      }}
                      className="absolute right-1 top-1 z-10 inline-flex size-6 items-center justify-center rounded-full bg-primary-900/80 text-primary-50 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </button>
                    <div className="mt-1 truncate text-xs font-medium text-primary-700">
                      {attachment.name}
                    </div>
                    <div className="text-[11px] text-primary-400">
                      {formatFileSize(attachment.size)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {isMobileViewport ? (
          /* ── Mobile: Telegram-style single-row bar ── */
          <>
            <div className="flex items-center gap-2 px-3 py-2">
              {/* + button — opens bottom sheet actions menu */}
              <button
                type="button"
                aria-label="Actions"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  setIsModelMenuOpen(false)
                  setIsMobileActionsMenuOpen((prev) => !prev)
                }}
                className="size-8 shrink-0 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-primary-600 active:bg-neutral-200 dark:active:bg-white/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.5} />
              </button>

              {/* Textarea — flex-1, auto-growing */}
              <PromptInputTextarea
                placeholder={promptPlaceholder}
                autoFocus
                inputRef={promptRef}
                onKeyDown={handlePromptKeyDown}
                onFocus={() => {
                  setMobileComposerFocused(true)
                  if (!window.visualViewport) {
                    setMobileKeyboardOpen(true)
                    setMobileKeyboardInset(0)
                  }
                }}
                onBlur={() => {
                  setMobileComposerFocused(false)
                  if (!window.visualViewport) {
                    setMobileKeyboardOpen(false)
                    setMobileKeyboardInset(0)
                  }
                }}
                className="min-h-[36px] max-h-[120px] flex-1 text-base leading-snug"
              />

              {/* Right side: stop / send / mic */}
              <div className="shrink-0">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleAbort}
                    aria-label="Stop generation"
                    className="size-9 rounded-full bg-red-500 flex items-center justify-center text-white transition-all duration-150"
                  >
                    <HugeiconsIcon icon={StopIcon} size={18} strokeWidth={2} />
                  </button>
                ) : value.trim().length > 0 ||
                  attachments.length > 0 ||
                  attachmentProcessingCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitDisabled}
                    aria-label="Send message"
                    className="size-9 rounded-full bg-accent-500 flex items-center justify-center text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                    <HugeiconsIcon
                      icon={ArrowUp02Icon}
                      size={18}
                      strokeWidth={2}
                    />
                  </button>
                ) : voiceInput.isSupported || voiceRecorder.isSupported ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (voiceInput.isListening) {
                        voiceInput.stop()
                      } else if (voiceRecorder.isRecording) {
                        voiceRecorder.stop()
                      } else {
                        voiceInput.start()
                      }
                    }}
                    onPointerDown={handleMicPointerDown}
                    onPointerUp={handleMicPointerUp}
                    onPointerLeave={handleMicPointerUp}
                    aria-label={
                      voiceRecorder.isRecording
                        ? 'Recording voice note'
                        : voiceInput.isListening
                          ? 'Stop listening'
                          : 'Voice input'
                    }
                    disabled={disabled}
                    className={cn(
                      'size-9 rounded-full flex items-center justify-center relative transition-all duration-150 select-none',
                      voiceRecorder.isRecording
                        ? 'text-red-600 bg-red-100 animate-pulse'
                        : voiceInput.isListening
                          ? 'text-red-500 bg-red-50 animate-pulse'
                          : 'text-primary-500 bg-neutral-100 dark:bg-white/10',
                    )}
                  >
                    <HugeiconsIcon
                      icon={Mic01Icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                    {voiceRecorder.isRecording ? (
                      <span className="absolute -top-1 -right-1 flex size-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex size-3 rounded-full bg-red-500" />
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitDisabled}
                    aria-label="Send message"
                    className="size-9 rounded-full bg-accent-500 flex items-center justify-center text-white transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <HugeiconsIcon
                      icon={ArrowUp02Icon}
                      size={18}
                      strokeWidth={2}
                    />
                  </button>
                )}
              </div>
            </div>

            {typeof document !== 'undefined' && isMobileActionsMenuOpen
              ? createPortal(
                  <>
                    <button
                      type="button"
                      aria-label="Close actions"
                      className="fixed inset-0 z-[199] bg-black/30"
                      onClick={() => {
                        setIsMobileActionsMenuOpen(false)
                        setIsModelMenuOpen(false)
                      }}
                    />
                    <div
                      className="fixed bottom-0 left-0 right-0 z-[200] rounded-t-2xl bg-white shadow-2xl pb-safe dark:bg-neutral-900 animate-in slide-in-from-bottom-10 duration-200"
                      role="dialog"
                      aria-label="Actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="mx-auto mt-3 mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                      <div className="px-4 pb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                        Actions
                      </div>
                      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                        {/* Attach File — keep sheet open so iOS picker can layer on top */}
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={(event) => {
                            handleOpenAttachmentPicker(event)
                            // sheet stays open; closes naturally after file selected or on backdrop tap
                          }}
                          className="rounded-xl border border-neutral-100 bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-700 p-3 flex flex-col items-start gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-1.5 text-orange-600 dark:text-orange-400">
                            <HugeiconsIcon
                              icon={Add01Icon}
                              size={24}
                              strokeWidth={1.5}
                            />
                          </span>
                          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                            Attach File
                          </span>
                        </button>

                        {/* Model selector — opens model picker sheet on top */}
                        <button
                          type="button"
                          disabled={isModelSwitcherDisabled}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!isModelSwitcherDisabled) {
                              setIsMobileActionsMenuOpen(false)
                              setIsModelMenuOpen(true)
                            }
                          }}
                          className="rounded-xl border border-neutral-100 bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-700 p-3 flex flex-col items-start gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="rounded-lg bg-indigo-100 dark:bg-indigo-900/30 p-1.5 text-indigo-600 dark:text-indigo-400">
                            <HugeiconsIcon
                              icon={ArrowDown01Icon}
                              size={24}
                              strokeWidth={1.5}
                            />
                          </span>
                          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate max-w-full">
                            {modelButtonLabel}
                          </span>
                        </button>

                        {hasDraft && !isLoading ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleClearDraft()
                              setIsMobileActionsMenuOpen(false)
                            }}
                            className="rounded-xl border border-neutral-100 bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-700 p-3 flex flex-col items-start gap-2 text-left"
                          >
                            <span className="rounded-lg bg-red-100 dark:bg-red-900/30 p-1.5 text-red-600 dark:text-red-400">
                              <HugeiconsIcon
                                icon={Delete01Icon}
                                size={24}
                                strokeWidth={1.5}
                              />
                            </span>
                            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                              Clear Draft
                            </span>
                          </button>
                        ) : null}

                        {onNewSession ? (
                          <button
                            type="button"
                            onClick={() => {
                              onNewSession()
                              setIsMobileActionsMenuOpen(false)
                            }}
                            className="rounded-xl border border-neutral-100 bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-700 p-3 flex flex-col items-start gap-2 text-left"
                          >
                            <span className="rounded-lg bg-green-100 dark:bg-green-900/30 p-1.5 text-green-600 dark:text-green-400">
                              <HugeiconsIcon
                                icon={Add01Icon}
                                size={24}
                                strokeWidth={1.5}
                              />
                            </span>
                            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                              New Session
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>,
                  document.body,
                )
              : null}

            {/* Mobile model picker portal — z above actions sheet (z-[210]) */}
            {typeof document !== 'undefined' && isModelMenuOpen
              ? createPortal(
                  <>
                    <button
                      type="button"
                      aria-label="Close model picker"
                      className="fixed inset-0 z-[209] bg-black/30"
                      onClick={() => setIsModelMenuOpen(false)}
                    />
                    <div
                      className="fixed bottom-0 left-0 right-0 z-[210] rounded-t-2xl bg-white shadow-2xl pb-safe dark:bg-neutral-900 animate-in slide-in-from-bottom-10 duration-200"
                      role="dialog"
                      aria-label="Select model"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="mx-auto mt-3 mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                      <div className="px-4 pb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                        Model
                      </div>
                      <div className="pb-4 max-h-[60dvh] overflow-y-auto overflow-x-hidden">
                        {(() => {
                          const allModels = modelsQuery.data?.models ?? []
                          const defaultProvider =
                            modelsQuery.data?.currentProvider ?? ''
                          if (allModels.length === 0) {
                            return (
                              <div className="p-4 text-center text-sm text-neutral-500">
                                <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  No models available
                                </p>
                                <p className="text-xs">
                                  Check your Claude provider configuration.
                                </p>
                              </div>
                            )
                          }
                          // Parse models into typed entries
                          const parsed = allModels.map((m) => {
                            const mId = String(
                              typeof m === 'string'
                                ? m
                                : m.id || m.model || m.name || 'unknown',
                            )
                            const mName = String(
                              typeof m === 'string'
                                ? m
                                : m.name ||
                                    m.displayName ||
                                    m.label ||
                                    m.id ||
                                    m.model ||
                                    m,
                            )
                            const mProvider =
                              typeof m === 'string'
                                ? defaultProvider
                                : ((m as Record<string, unknown>)
                                    .provider as string) || defaultProvider
                            const LOCAL_PROVIDER_IDS = ['ollama', 'atomic-chat']
                            const isLocal =
                              (typeof m !== 'string' &&
                              (m as Record<string, unknown>).description ===
                                'local') || LOCAL_PROVIDER_IDS.includes(mProvider)
                            return {
                              id: mId,
                              name: mName,
                              provider: mProvider,
                              isLocal,
                            }
                          })
                          // Split pinned vs unpinned, group unpinned by provider
                          const pinnedEntries = parsed.filter((e) =>
                            isPinned(e.id),
                          )
                          const unpinnedGroups = new Map<
                            string,
                            typeof parsed
                          >()
                          for (const entry of parsed) {
                            if (isPinned(entry.id)) continue
                            const group =
                              unpinnedGroups.get(entry.provider) ?? []
                            group.push(entry)
                            unpinnedGroups.set(entry.provider, group)
                          }
                          const renderEntry = (entry: (typeof parsed)[0]) => {
                            const isActive =
                              entry.id === currentModel ||
                              `${defaultProvider}/${entry.id}` === currentModel
                            return (
                              <div
                                key={entry.id}
                                className="group relative flex items-center"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleModelSelect(
                                      entry.id,
                                      entry.provider || undefined,
                                    )
                                    setIsModelMenuOpen(false)
                                  }}
                                  className={`flex flex-1 items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                                    isActive
                                      ? 'bg-accent-50 text-accent-700 font-medium dark:bg-accent-900/30 dark:text-accent-300 border-l-2 border-accent-500'
                                      : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800'
                                  }`}
                                >
                                  <span className="flex-1 truncate">
                                    {entry.name}
                                  </span>
                                  {entry.isLocal && (
                                    <span className="text-[10px] text-neutral-400 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
                                      local
                                    </span>
                                  )}
                                  {isActive && (
                                    <span className="size-1.5 rounded-full bg-accent-500 shrink-0" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    togglePin(entry.id)
                                  }}
                                  className={`absolute right-3 rounded p-1 transition-opacity ${
                                    isPinned(entry.id)
                                      ? 'text-accent-500 opacity-80 hover:opacity-100'
                                      : 'text-neutral-400 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-accent-500'
                                  }`}
                                  aria-label={
                                    isPinned(entry.id)
                                      ? `Unpin ${entry.name}`
                                      : `Pin ${entry.name}`
                                  }
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill={
                                      isPinned(entry.id)
                                        ? 'currentColor'
                                        : 'none'
                                    }
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                  </svg>
                                </button>
                              </div>
                            )
                          }
                          return (
                            <>
                              {pinnedEntries.length > 0 && (
                                <div className="mb-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
                                  <div className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                                    <svg
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className="text-accent-500"
                                    >
                                      <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                    </svg>
                                    <span>Pinned</span>
                                  </div>
                                  {pinnedEntries.map(renderEntry)}
                                </div>
                              )}
                              {Array.from(unpinnedGroups.entries())
                                .sort((a, b) => a[0].localeCompare(b[0]))
                                .map(([provider, models]) => (
                                  <div key={provider}>
                                    <div className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                                      {provider}
                                    </div>
                                    {models.map(renderEntry)}
                                  </div>
                                ))}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </>,
                  document.body,
                )
              : null}
          </>
        ) : (
          /* ── Desktop: original layout ── */
          <>
            <PromptInputTextarea
              placeholder={promptPlaceholder}
              autoFocus
              inputRef={promptRef}
              onKeyDown={handlePromptKeyDown}
              onFocus={() => {
                setMobileComposerFocused(true)
                // Keep fallback behavior for browsers without visualViewport.
                if (!window.visualViewport) {
                  setMobileKeyboardOpen(true)
                  setMobileKeyboardInset(0)
                }
              }}
              onBlur={() => {
                setMobileComposerFocused(false)
                if (!window.visualViewport) {
                  setMobileKeyboardOpen(false)
                  setMobileKeyboardInset(0)
                }
              }}
              className="min-h-[44px]"
            />
            <PromptInputActions className="justify-between px-1.5 md:px-3 gap-0.5 md:gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-0 md:gap-1">
                <PromptInputAction tooltip="Add attachment">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="rounded-lg text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-primary-500"
                    aria-label="Add attachment"
                    disabled={disabled}
                    onClick={handleOpenAttachmentPicker}
                  >
                    <HugeiconsIcon
                      icon={Add01Icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </Button>
                </PromptInputAction>
                {hasDraft && !isLoading && (
                  <PromptInputAction tooltip="Clear draft">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-lg text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-red-600"
                      aria-label="Clear draft"
                      onClick={handleClearDraft}
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </Button>
                  </PromptInputAction>
                )}
                {/* Token counter — bottom bar, mirrors Claude style, triggers at ~25 tokens */}
                {value.length >= 100 && (
                  <span className="ml-1 text-[10px] text-primary-400 tabular-nums select-none">
                    ~{Math.ceil(value.length / 4)} tokens
                  </span>
                )}

                {!hideModelSelector ? (
                  <div
                    className="ml-0.5 md:ml-1 flex min-w-0 items-center"
                    ref={modelSelectorRef}
                  >
                  <button
                    type="button"
                    onClick={() => setIsModelMenuOpen((prev) => !prev)}
                    disabled={isModelSwitcherDisabled}
                    className="inline-flex h-7 max-w-[8rem] items-center rounded-full bg-primary-100/70 px-1.5 md:max-w-none md:px-2.5 text-[11px] font-medium text-primary-600 hover:bg-primary-200/80 dark:hover:bg-primary-800/60 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    title={modelButtonLabel}
                  >
                    <span className="max-w-[5.5rem] truncate sm:max-w-[8.5rem] md:max-w-[12rem]">
                      {modelButtonLabel}
                    </span>
                  </button>
                  {isModelMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[199]"
                        onClick={() => setIsModelMenuOpen(false)}
                      />
                      <div className="absolute bottom-full left-0 mb-2 z-[200] min-w-[16rem] max-w-[calc(100vw-2rem)] sm:max-w-[28rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900 animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="max-h-[20rem] overflow-y-auto overflow-x-hidden p-1">
                          {(() => {
                            const allModels = modelsQuery.data?.models ?? []
                            const defaultProvider =
                              modelsQuery.data?.currentProvider ?? ''
                            if (allModels.length === 0) {
                              return (
                                <div className="p-4 text-center text-sm text-neutral-500">
                                  No models available
                                </div>
                              )
                            }
                            const parsed = allModels.map((m) => {
                              const mId = String(
                                typeof m === 'string'
                                  ? m
                                  : m.id || m.model || m.name || 'unknown',
                              )
                              const mName = String(
                                typeof m === 'string'
                                  ? m
                                  : m.name ||
                                      m.displayName ||
                                      m.label ||
                                      m.id ||
                                      m.model ||
                                      m,
                              )
                              const mProvider =
                                typeof m === 'string'
                                  ? defaultProvider
                                  : ((m as Record<string, unknown>)
                                      .provider as string) || defaultProvider
                              const isLocal =
                                typeof m !== 'string' &&
                                (m as Record<string, unknown>).description ===
                                  'local'
                              return {
                                id: mId,
                                name: mName,
                                provider: mProvider,
                                isLocal,
                              }
                            })
                            const pinnedEntries = parsed.filter((e) =>
                              isPinned(e.id),
                            )
                            const unpinnedGroups = new Map<
                              string,
                              typeof parsed
                            >()
                            for (const entry of parsed) {
                              if (isPinned(entry.id)) continue
                              const group =
                                unpinnedGroups.get(entry.provider) ?? []
                              group.push(entry)
                              unpinnedGroups.set(entry.provider, group)
                            }
                            const renderEntry = (entry: (typeof parsed)[0]) => {
                              const isActive =
                                entry.id === currentModel ||
                                `${defaultProvider}/${entry.id}` ===
                                  currentModel
                              return (
                                <div
                                  key={entry.id}
                                  className="group relative flex items-center"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleModelSelect(
                                        entry.id,
                                        entry.provider || undefined,
                                      )
                                      setIsModelMenuOpen(false)
                                    }}
                                    className={`flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                                      isActive
                                        ? 'border-l-2 border-accent-500 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                                        : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/50'
                                    }`}
                                  >
                                    <span className="flex-1 truncate">
                                      {entry.name}
                                    </span>
                                    {entry.isLocal && (
                                      <span className="text-[10px] text-neutral-400 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700">
                                        local
                                      </span>
                                    )}
                                    {isActive && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      togglePin(entry.id)
                                    }}
                                    className={`absolute right-2 rounded p-1 transition-opacity ${
                                      isPinned(entry.id)
                                        ? 'text-accent-500 opacity-80 hover:opacity-100'
                                        : 'text-neutral-400 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-accent-500'
                                    }`}
                                    aria-label={
                                      isPinned(entry.id)
                                        ? `Unpin ${entry.name}`
                                        : `Pin ${entry.name}`
                                    }
                                  >
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill={
                                        isPinned(entry.id)
                                          ? 'currentColor'
                                          : 'none'
                                      }
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                    </svg>
                                  </button>
                                </div>
                              )
                            }
                            return (
                              <>
                                {pinnedEntries.length > 0 && (
                                  <div className="mb-1 border-b border-neutral-200 dark:border-neutral-700 pb-1">
                                    <div className="mb-1 flex items-center gap-1 px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        className="text-accent-500"
                                      >
                                        <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                      </svg>
                                      <span>Pinned</span>
                                    </div>
                                    {pinnedEntries.map(renderEntry)}
                                  </div>
                                )}
                                {Array.from(unpinnedGroups.entries())
                                  .sort((a, b) => a[0].localeCompare(b[0]))
                                  .map(([provider, models]) => (
                                    <div key={provider}>
                                      <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                                        {provider}
                                      </div>
                                      {models.map(renderEntry)}
                                    </div>
                                  ))}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </>
                  )}
                  </div>
                ) : null}
              </div>
              <div className="ml-1 flex shrink-0 items-center gap-0.5 md:gap-1">
                {voiceInput.isSupported || voiceRecorder.isSupported ? (
                  <PromptInputAction
                    tooltip={
                      voiceRecorder.isRecording
                        ? `Recording… ${Math.round(voiceRecorder.durationMs / 1000)}s`
                        : voiceInput.isListening
                          ? 'Listening — tap to stop'
                          : 'Tap: dictate · Hold: voice note'
                    }
                  >
                    <Button
                      onClick={() => {
                        // Toggle voice input on click
                        if (voiceInput.isListening) {
                          voiceInput.stop()
                        } else if (voiceRecorder.isRecording) {
                          voiceRecorder.stop()
                        } else {
                          voiceInput.start()
                        }
                      }}
                      onPointerDown={handleMicPointerDown}
                      onPointerUp={handleMicPointerUp}
                      onPointerLeave={handleMicPointerUp}
                      size="icon-sm"
                      variant="ghost"
                      className={cn(
                        'rounded-lg transition-colors select-none',
                        voiceRecorder.isRecording
                          ? 'text-red-600 bg-red-100 hover:bg-red-200 animate-pulse'
                          : voiceInput.isListening
                            ? 'text-red-500 bg-red-50 hover:bg-red-100 animate-pulse'
                            : 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-primary-700',
                      )}
                      aria-label={
                        voiceRecorder.isRecording
                          ? 'Recording voice note'
                          : voiceInput.isListening
                            ? 'Stop listening'
                            : 'Voice input'
                      }
                      disabled={disabled}
                    >
                      <HugeiconsIcon
                        icon={Mic01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                      {voiceRecorder.isRecording ? (
                        <span className="absolute -top-1 -right-1 flex size-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex size-3 rounded-full bg-red-500" />
                        </span>
                      ) : null}
                    </Button>
                  </PromptInputAction>
                ) : null}
                {isLoading ? (
                  <PromptInputAction tooltip="Stop generation">
                    <Button
                      onClick={handleAbort}
                      size="icon-sm"
                      variant="destructive"
                      className="rounded-md"
                      aria-label="Stop generation"
                    >
                      <HugeiconsIcon
                        icon={StopIcon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </Button>
                  </PromptInputAction>
                ) : (
                  <>
                    <PromptInputAction tooltip="Send message">
                      <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitDisabled}
                        size="icon-sm"
                        className="rounded-full"
                        aria-label="Send message"
                      >
                        <HugeiconsIcon
                          icon={ArrowUp02Icon}
                          size={20}
                          strokeWidth={1.5}
                        />
                      </Button>
                    </PromptInputAction>
                  </>
                )}
              </div>
            </PromptInputActions>
          </>
        )}
      </PromptInput>

      {/* Fullscreen image preview overlay — portaled to body to escape stacking context */}
      {previewImage &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setPreviewImage(null)}
            role="dialog"
            aria-label="Image preview"
          >
            <button
              type="button"
              className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white dark:hover:bg-white/10/30 active:bg-white/40 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setPreviewImage(null)
              }}
              aria-label="Close preview"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={2} />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}

const MemoizedChatComposer = memo(ChatComposerComponent)

export { MemoizedChatComposer as ChatComposer }
export type {
  ChatComposerAttachment,
  ChatComposerHelpers,
  ChatComposerHandle,
  ThinkingLevel,
}
