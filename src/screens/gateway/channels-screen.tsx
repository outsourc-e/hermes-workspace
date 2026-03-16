import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertDiamondIcon,
  ArrowTurnBackwardIcon,
  Chat01Icon,
  LinkSquare02Icon,
  RefreshIcon,
  SatelliteIcon,
} from '@hugeicons/core-free-icons'
import { EmptyState } from '@/components/empty-state'
import { useGatewayRestart } from '@/components/gateway-restart-overlay'
import { toast } from '@/components/ui/toast'

type ProbeResult = {
  ok?: boolean
  error?: string
  elapsedMs?: number
  status?: number
  bot?: {
    username?: string | null
    id?: string | number | null
  }
}

type ChannelInfo = {
  configured?: boolean
  running?: boolean
  mode?: string
  lastStartAt?: number | null
  lastStopAt?: number | null
  lastProbeAt?: number | null
  lastError?: string | null
}

type ChannelAccount = {
  accountId: string
  connected?: boolean
  configured?: boolean
  running?: boolean
  mode?: string
  lastStartAt?: number | null
  lastStopAt?: number | null
  lastProbeAt?: number | null
  lastError?: string | null
  lastConnectedAt?: number | null
  reconnectAttempts?: number
  probe?: ProbeResult
  allowFrom?: string[]
  application?: {
    intents?: {
      presence?: string
      guildMembers?: string
      messageContent?: string
    }
  }
  bot?: {
    username?: string
    id?: string
  }
}

type ChannelsData = {
  channels?: Record<string, ChannelInfo>
  channelLabels?: Record<string, string>
  channelDetailLabels?: Record<string, string>
  channelAccounts?: Record<string, ChannelAccount[]>
  channelDefaultAccountId?: Record<string, string>
}

type ChannelConfig = {
  allowFrom?: Array<string | number>
  blockStreaming?: boolean
  streamMode?: 'off' | 'partial' | 'block'
  streaming?: 'off' | 'partial' | 'full' | string
  ackReaction?: string
  activity?: string
  activityType?: number
  activityUrl?: string
  status?: 'online' | 'dnd' | 'idle' | 'invisible'
}

type ConfigPayload = {
  parsed?: {
    messages?: {
      ackReaction?: string
      ackReactionScope?: 'group-mentions' | 'group-all' | 'direct' | 'all'
    }
    channels?: Record<string, ChannelConfig>
  }
}

type PatchVariables = {
  path: string
  value: unknown
  successMessage: string
}

const DISCORD_ACTIVITY_TYPE_TO_LABEL: Record<number, string> = {
  0: 'playing',
  1: 'streaming',
  2: 'listening',
  3: 'watching',
  4: 'custom',
  5: 'competing',
}

const DISCORD_LABEL_TO_ACTIVITY_TYPE: Record<string, number> = {
  playing: 0,
  streaming: 1,
  listening: 2,
  watching: 3,
  custom: 4,
  competing: 5,
}

function formatTime(ts?: number | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRelative(ts?: number | null) {
  if (!ts) return 'Never'
  const deltaMs = Date.now() - ts
  const deltaMinutes = Math.round(deltaMs / 60_000)
  if (deltaMinutes <= 1) return 'Just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`
  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  const deltaDays = Math.round(deltaHours / 24)
  return `${deltaDays}d ago`
}

function probeTone(probe?: ProbeResult | null) {
  if (probe?.ok === true) {
    return {
      dot: 'bg-emerald-500',
      text: 'text-emerald-700',
      label: 'Probe OK',
    }
  }

  if (probe?.ok === false || probe?.error) {
    return {
      dot: 'bg-red-500',
      text: 'text-red-600',
      label: 'Probe failed',
    }
  }

  return {
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    label: 'Probe pending',
  }
}

function StatusDot({
  className,
}: {
  className: string
}) {
  return <span className={`inline-block size-2 rounded-full ${className}`} />
}

async function fetchJson<TPayload>(url: string): Promise<TPayload> {
  const response = await fetch(url)
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    data?: TPayload
    payload?: TPayload
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }

  return (payload.data ?? payload.payload) as TPayload
}

async function patchGatewayConfig(
  path: string,
  value: unknown,
): Promise<void> {
  const response = await fetch('/api/config-patch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, value }),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Failed to update gateway config')
  }
}

export function ChannelsScreen() {
  const queryClient = useQueryClient()
  const { triggerRestart, isRestarting } = useGatewayRestart()
  const [allowlistDrafts, setAllowlistDrafts] = useState<Record<string, string>>({})

  const statusQuery = useQuery({
    queryKey: ['gateway', 'channels', 'status'],
    queryFn: () => fetchJson<ChannelsData>('/api/gateway/channels'),
    refetchInterval: 5_000,
    retry: 1,
  })

  const probeQuery = useQuery({
    queryKey: ['gateway', 'channels', 'probe'],
    queryFn: () =>
      fetchJson<ChannelsData>('/api/gateway/channels?probe=1&timeoutMs=6000'),
    refetchInterval: 30_000,
    retry: 0,
  })

  const configQuery = useQuery({
    queryKey: ['gateway', 'config'],
    queryFn: () => fetchJson<ConfigPayload>('/api/config-get'),
    retry: 1,
  })

  const patchMutation = useMutation({
    mutationFn: async (variables: PatchVariables) => {
      await patchGatewayConfig(variables.path, variables.value)
      return variables
    },
    onSuccess: async (variables) => {
      toast(variables.successMessage, { type: 'success' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gateway', 'config'] }),
        queryClient.invalidateQueries({ queryKey: ['gateway', 'channels'] }),
      ])
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to update channel config',
        { type: 'error' },
      )
    },
  })

  useEffect(() => {
    function handleGatewayRestarted() {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gateway', 'config'] }),
        queryClient.invalidateQueries({ queryKey: ['gateway', 'channels'] }),
      ])
    }

    window.addEventListener('gateway:restarted', handleGatewayRestarted)
    return () =>
      window.removeEventListener('gateway:restarted', handleGatewayRestarted)
  }, [queryClient])

  const lastUpdated = statusQuery.dataUpdatedAt
    ? new Date(statusQuery.dataUpdatedAt).toLocaleTimeString()
    : null

  const channels = statusQuery.data?.channels || {}
  const labels = statusQuery.data?.channelLabels || {}
  const detailLabels = statusQuery.data?.channelDetailLabels || {}
  const statusAccounts = statusQuery.data?.channelAccounts || {}
  const probeAccounts = probeQuery.data?.channelAccounts || {}
  const defaultAccountIds = statusQuery.data?.channelDefaultAccountId || {}
  const configChannels = configQuery.data?.parsed?.channels || {}
  const globalAckReaction = configQuery.data?.parsed?.messages?.ackReaction
  const globalAckScope = configQuery.data?.parsed?.messages?.ackReactionScope
  const channelEntries = Object.entries(channels)

  async function applyConfigPatch(variables: PatchVariables) {
    await triggerRestart(async () => {
      await patchMutation.mutateAsync(variables)
    })
  }

  function resolvePrimaryAccount(channelId: string): ChannelAccount | undefined {
    const accounts = statusAccounts[channelId] || []
    const defaultAccountId = defaultAccountIds[channelId]
    return (
      accounts.find((account) => account.accountId === defaultAccountId) ||
      accounts[0]
    )
  }

  function resolveProbeAccount(channelId: string): ChannelAccount | undefined {
    const accounts = probeAccounts[channelId] || []
    const defaultAccountId = defaultAccountIds[channelId]
    return (
      accounts.find((account) => account.accountId === defaultAccountId) ||
      accounts[0]
    )
  }

  function readStreamingMode(channelId: string, config: ChannelConfig | undefined) {
    if (!config) return 'partial'
    if (channelId === 'telegram') {
      if (config.streamMode === 'block') return 'full'
      if (config.streamMode === 'off') return 'off'
      if (config.streamMode === 'partial') return 'partial'
    }
    if (config.streaming === 'off') return 'off'
    if (config.streaming === 'full') return 'full'
    return 'partial'
  }

  async function updateStreamingMode(
    channelId: string,
    mode: 'off' | 'partial' | 'full',
  ) {
    if (channelId === 'telegram') {
      const value = mode === 'full' ? 'block' : mode
      await applyConfigPatch({
        path: `channels.${channelId}.streamMode`,
        value,
        successMessage: `${labels[channelId] || channelId} streaming mode updated`,
      })
      return
    }

    await applyConfigPatch({
      path: `channels.${channelId}.streaming`,
      value: mode,
      successMessage: `${labels[channelId] || channelId} streaming mode updated`,
    })
  }

  async function updateAckScope(
    nextScope: 'group-mentions' | 'all' | 'none',
    channelId: string,
    channelConfig: ChannelConfig | undefined,
  ) {
    if (nextScope === 'none') {
      await applyConfigPatch({
        path: `channels.${channelId}.ackReaction`,
        value: '',
        successMessage: `${labels[channelId] || channelId} ack reactions disabled`,
      })
      return
    }

    const reaction =
      channelConfig?.ackReaction ||
      globalAckReaction ||
      '👀'

    await applyConfigPatch({
      path: `channels.${channelId}.ackReaction`,
      value: reaction,
      successMessage: `${labels[channelId] || channelId} ack reactions enabled`,
    })

    await applyConfigPatch({
      path: 'messages.ackReactionScope',
      value: nextScope,
      successMessage: 'Ack reaction scope updated',
    })
  }

  async function toggleAckReaction(
    channelId: string,
    enabled: boolean,
    channelConfig: ChannelConfig | undefined,
  ) {
    await applyConfigPatch({
      path: `channels.${channelId}.ackReaction`,
      value: enabled
        ? channelConfig?.ackReaction || globalAckReaction || '👀'
        : '',
      successMessage: `${labels[channelId] || channelId} ack reactions ${enabled ? 'enabled' : 'disabled'}`,
    })
  }

  async function submitAllowFrom(
    channelId: string,
    current: Array<string | number>,
  ) {
    const draft = (allowlistDrafts[channelId] || '').trim()
    if (!draft) return

    const next = Array.from(
      new Set([...current.map((value) => String(value)), draft]),
    )

    setAllowlistDrafts((prev) => ({ ...prev, [channelId]: '' }))
    await applyConfigPatch({
      path: `channels.${channelId}.allowFrom`,
      value: next,
      successMessage: `${labels[channelId] || channelId} allowlist updated`,
    })
  }

  async function removeAllowFrom(
    channelId: string,
    current: Array<string | number>,
    valueToRemove: string,
  ) {
    const next = current
      .map((value) => String(value))
      .filter((value) => value !== valueToRemove)

    await applyConfigPatch({
      path: `channels.${channelId}.allowFrom`,
      value: next,
      successMessage: `${labels[channelId] || channelId} allowlist updated`,
    })
  }

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-primary-200 bg-white p-2 text-primary-600 shadow-sm">
              <HugeiconsIcon icon={SatelliteIcon} size={18} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-primary-900">Channels</h1>
              <p className="text-xs text-primary-500">
                Live channel health, probe status, and per-channel Hermes config
              </p>
            </div>
            {statusQuery.isFetching && !statusQuery.isLoading ? (
              <span className="text-[10px] text-primary-500 animate-pulse">
                syncing…
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {isRestarting ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white px-2.5 py-1 text-[11px] font-medium text-primary-600">
                <HugeiconsIcon icon={RefreshIcon} size={12} className="animate-spin" />
                Restarting Hermes
              </span>
            ) : null}
            {lastUpdated ? (
              <span className="text-[10px] text-primary-500">Updated {lastUpdated}</span>
            ) : null}
            <StatusDot
              className={
                statusQuery.isError
                  ? 'bg-red-500'
                  : statusQuery.isSuccess
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
              }
            />
          </div>
        </header>

        {statusQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-primary-200 bg-white">
            <div className="flex items-center gap-2 text-primary-500">
              <div className="size-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
              <span className="text-sm">Connecting to Hermes…</span>
            </div>
          </div>
        ) : statusQuery.isError ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-primary-200 bg-white">
            <HugeiconsIcon
              icon={AlertDiamondIcon}
              size={24}
              strokeWidth={1.5}
              className="text-red-500"
            />
            <p className="text-sm text-primary-600">
              {statusQuery.error instanceof Error
                ? statusQuery.error.message
                : 'Failed to fetch channel status'}
            </p>
            <button
              type="button"
              onClick={() => {
                void statusQuery.refetch()
                void configQuery.refetch()
                void probeQuery.refetch()
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
            >
              <HugeiconsIcon
                icon={ArrowTurnBackwardIcon}
                size={14}
                strokeWidth={1.5}
              />
              Retry
            </button>
          </div>
        ) : channelEntries.length === 0 ? (
          <EmptyState
            icon={Chat01Icon}
            title="No channels configured"
            description="Connect Telegram, Discord, or other messaging platforms in settings."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {channelEntries.map(([channelId, channel]) => {
              const primaryAccount = resolvePrimaryAccount(channelId)
              const probeAccount = resolveProbeAccount(channelId)
              const config = configChannels[channelId]
              const allowFrom = config?.allowFrom || []
              const effectiveAckReaction =
                config?.ackReaction ?? globalAckReaction ?? '👀'
              const ackEnabled = effectiveAckReaction !== ''
              const ackScope =
                !ackEnabled
                  ? 'none'
                  : globalAckScope === 'all'
                    ? 'all'
                    : 'group-mentions'
              const streamingMode = readStreamingMode(channelId, config)
              const probe = probeAccount?.probe
              const probeStatus = probeTone(probe)
              const connected =
                primaryAccount?.connected ?? channel.running ?? false
              const running = channel.running ?? primaryAccount?.running ?? false

              return (
                <article
                  key={channelId}
                  className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 border-b border-primary-100 pb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold text-primary-900">
                            {labels[channelId] || channelId}
                          </h2>
                          <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary-500">
                            {detailLabels[channelId] || 'Channel'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-primary-500">
                          {primaryAccount?.bot?.username
                            ? `Connected as @${primaryAccount.bot.username}`
                            : 'Gateway channel account'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium">
                          <StatusDot className={running ? 'bg-emerald-500' : 'bg-red-500'} />
                          <span className={running ? 'text-emerald-700' : 'text-red-600'}>
                            {running ? 'Running' : 'Stopped'}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium">
                          <StatusDot className={connected ? 'bg-emerald-500' : 'bg-amber-500'} />
                          <span className={connected ? 'text-emerald-700' : 'text-amber-700'}>
                            {connected ? 'Connected' : 'Not connected'}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium">
                          <StatusDot className={probeStatus.dot} />
                          <span className={probeStatus.text}>{probeStatus.label}</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-primary-500">
                          Connected
                        </p>
                        <p className="mt-1 text-sm font-semibold text-primary-900">
                          {connected ? 'Live' : 'Disconnected'}
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          Last event {formatTime(primaryAccount?.lastConnectedAt)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-primary-500">
                          Last start
                        </p>
                        <p className="mt-1 text-sm font-semibold text-primary-900">
                          {formatTime(channel.lastStartAt)}
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          {formatRelative(channel.lastStartAt)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-primary-500">
                          Last probe
                        </p>
                        <p className="mt-1 text-sm font-semibold text-primary-900">
                          {formatTime(probeAccount?.lastProbeAt || channel.lastProbeAt)}
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          {formatRelative(probeAccount?.lastProbeAt || channel.lastProbeAt)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-primary-500">
                          Runtime
                        </p>
                        <p className="mt-1 text-sm font-semibold text-primary-900">
                          {primaryAccount?.mode || channel.mode || '—'}
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          Reconnects {primaryAccount?.reconnectAttempts ?? 0}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-primary-200 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-primary-500">
                          Probe result
                        </p>
                        <p className={`mt-1 text-sm font-medium ${probeStatus.text}`}>
                          {probe?.ok === true
                            ? `OK${probe.elapsedMs ? ` · ${Math.round(probe.elapsedMs)}ms` : ''}`
                            : probe?.ok === false
                              ? `Error${probe.status ? ` · ${probe.status}` : ''}`
                              : probeQuery.isFetching
                                ? 'Refreshing probe…'
                                : 'No recent probe yet'}
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          {probe?.error || channel.lastError || 'No probe error recorded'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-primary-200 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-primary-500">
                          Account detail
                        </p>
                        <p className="mt-1 text-sm font-medium text-primary-900">
                          {primaryAccount?.accountId || 'default'}
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          {primaryAccount?.application?.intents?.presence
                            ? `Discord presence intent: ${primaryAccount.application.intents.presence}`
                            : primaryAccount?.configured
                              ? 'Configured and available'
                              : 'Configuration pending'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <section className="grid gap-3 md:grid-cols-2">
                      <label className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-primary-900">
                              Block streaming
                            </p>
                            <p className="text-xs text-primary-500">
                              Wait for block-complete replies before sending
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-accent-500"
                            checked={Boolean(config?.blockStreaming)}
                            disabled={patchMutation.isPending || isRestarting}
                            onChange={(event) => {
                              void applyConfigPatch({
                                path: `channels.${channelId}.blockStreaming`,
                                value: event.target.checked,
                                successMessage: `${labels[channelId] || channelId} block streaming updated`,
                              })
                            }}
                          />
                        </div>
                      </label>

                      <label className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <p className="text-sm font-medium text-primary-900">
                          Streaming mode
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          Partial updates, full block preview, or fully off
                        </p>
                        <select
                          className="mt-3 w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none"
                          value={streamingMode}
                          disabled={patchMutation.isPending || isRestarting}
                          onChange={(event) => {
                            void updateStreamingMode(
                              channelId,
                              event.target.value as 'off' | 'partial' | 'full',
                            )
                          }}
                        >
                          <option value="partial">Partial</option>
                          <option value="full">Full</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                    </section>

                    <section className="grid gap-3 md:grid-cols-2">
                      <label className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-primary-900">
                              Ack reactions
                            </p>
                            <p className="text-xs text-primary-500">
                              Send a quick processing reaction while the bot is thinking
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-accent-500"
                            checked={ackEnabled}
                            disabled={patchMutation.isPending || isRestarting}
                            onChange={(event) => {
                              void toggleAckReaction(
                                channelId,
                                event.target.checked,
                                config,
                              )
                            }}
                          />
                        </div>
                      </label>

                      <label className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                        <p className="text-sm font-medium text-primary-900">
                          Ack scope
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          Shared gateway message scope, surfaced here for channel tuning
                        </p>
                        <select
                          className="mt-3 w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none"
                          value={ackScope}
                          disabled={patchMutation.isPending || isRestarting}
                          onChange={(event) => {
                            void updateAckScope(
                              event.target.value as 'group-mentions' | 'all' | 'none',
                              channelId,
                              config,
                            )
                          }}
                        >
                          <option value="group-mentions">Group mentions</option>
                          <option value="all">All</option>
                          <option value="none">None</option>
                        </select>
                      </label>
                    </section>

                    <section className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon
                          icon={LinkSquare02Icon}
                          size={16}
                          strokeWidth={1.5}
                          className="text-primary-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-primary-900">
                            Allow-from list
                          </p>
                          <p className="text-xs text-primary-500">
                            Sender IDs allowed to initiate or continue messages in this channel
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {allowFrom.length > 0 ? (
                          allowFrom.map((value) => {
                            const normalized = String(value)
                            return (
                              <span
                                key={normalized}
                                className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1 text-xs text-primary-700"
                              >
                                {normalized}
                                <button
                                  type="button"
                                  className="text-primary-500 hover:text-red-600"
                                  disabled={patchMutation.isPending || isRestarting}
                                  onClick={() => {
                                    void removeAllowFrom(channelId, allowFrom, normalized)
                                  }}
                                >
                                  Remove
                                </button>
                              </span>
                            )
                          })
                        ) : (
                          <span className="rounded-full border border-dashed border-primary-200 bg-white px-3 py-1 text-xs text-primary-500">
                            No allowlist entries
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-col gap-2 md:flex-row">
                        <input
                          value={allowlistDrafts[channelId] || ''}
                          onChange={(event) =>
                            setAllowlistDrafts((prev) => ({
                              ...prev,
                              [channelId]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void submitAllowFrom(channelId, allowFrom)
                            }
                          }}
                          placeholder="Add user ID"
                          className="min-w-0 flex-1 rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                        />
                        <button
                          type="button"
                          className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            patchMutation.isPending ||
                            isRestarting ||
                            !(allowlistDrafts[channelId] || '').trim()
                          }
                          onClick={() => {
                            void submitAllowFrom(channelId, allowFrom)
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </section>

                    {channelId === 'discord' ? (
                      <section className="grid gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3 md:grid-cols-2">
                        <label>
                          <p className="text-sm font-medium text-primary-900">
                            Presence activity type
                          </p>
                          <select
                            className="mt-2 w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none"
                            value={
                              DISCORD_ACTIVITY_TYPE_TO_LABEL[config?.activityType ?? 4] ||
                              'watching'
                            }
                            disabled={patchMutation.isPending || isRestarting}
                            onChange={(event) => {
                              const nextLabel = event.target.value
                              void applyConfigPatch({
                                path: 'channels.discord.activityType',
                                value: DISCORD_LABEL_TO_ACTIVITY_TYPE[nextLabel],
                                successMessage: 'Discord presence activity type updated',
                              })
                            }}
                          >
                            <option value="playing">Playing</option>
                            <option value="listening">Listening</option>
                            <option value="watching">Watching</option>
                            <option value="streaming">Streaming</option>
                          </select>
                        </label>

                        <label>
                          <p className="text-sm font-medium text-primary-900">
                            Presence status
                          </p>
                          <select
                            className="mt-2 w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none"
                            value={config?.status || 'online'}
                            disabled={patchMutation.isPending || isRestarting}
                            onChange={(event) => {
                              void applyConfigPatch({
                                path: 'channels.discord.status',
                                value: event.target.value,
                                successMessage: 'Discord presence status updated',
                              })
                            }}
                          >
                            <option value="online">Online</option>
                            <option value="idle">Idle</option>
                            <option value="dnd">Do not disturb</option>
                            <option value="invisible">Invisible</option>
                          </select>
                        </label>

                        <label className="md:col-span-2">
                          <p className="text-sm font-medium text-primary-900">
                            Presence activity name
                          </p>
                          <input
                            defaultValue={config?.activity || ''}
                            placeholder="Focus mode"
                            className="mt-2 w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                            disabled={patchMutation.isPending || isRestarting}
                            onBlur={(event) => {
                              const next = event.target.value.trim()
                              if (next === (config?.activity || '')) return
                              void applyConfigPatch({
                                path: 'channels.discord.activity',
                                value: next,
                                successMessage: 'Discord presence activity updated',
                              })
                            }}
                          />
                        </label>

                        <label className="md:col-span-2">
                          <p className="text-sm font-medium text-primary-900">
                            Presence URL
                          </p>
                          <input
                            defaultValue={config?.activityUrl || ''}
                            placeholder="https://twitch.tv/example"
                            className="mt-2 w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                            disabled={patchMutation.isPending || isRestarting}
                            onBlur={(event) => {
                              const next = event.target.value.trim()
                              if (next === (config?.activityUrl || '')) return
                              void applyConfigPatch({
                                path: 'channels.discord.activityUrl',
                                value: next,
                                successMessage: 'Discord presence URL updated',
                              })
                            }}
                          />
                        </label>
                      </section>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
