import {
  Add01Icon,
  ArrowLeft01Icon,
  Copy01Icon,
  Delete02Icon,
  Edit01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { writeTextToClipboard } from '@/lib/clipboard'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  SettingsMobilePills,
  SettingsSidebar,
} from '@/components/settings/settings-sidebar'

type Transport = 'stdio' | 'http'

type McpServer = {
  name: string
  transport: Transport
  command?: string
  args?: Array<string>
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout?: number
  connectTimeout?: number
  auth?: unknown
}

type McpServersResponse = {
  ok?: boolean
  code?: string
  message?: string
  servers?: Array<McpServer>
}

type ServerDraft = {
  name: string
  transport: Transport
  command: string
  args: string
  envText: string
  url: string
  headersText: string
  timeout: string
}

const EMPTY_DRAFT: ServerDraft = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  envText: '',
  url: '',
  headersText: '',
  timeout: '',
}

function recordToLines(value?: Record<string, string>): string {
  if (!value) return ''
  return Object.entries(value)
    .map(([key, entry]) => `${key}=${entry}`)
    .join('\n')
}

function parseKeyValueLines(value: string): Record<string, string> | undefined {
  const entries = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) return []
      const key = line.slice(0, separatorIndex).trim()
      const entry = line.slice(separatorIndex + 1).trim()
      return key ? [[key, entry] as const] : []
    })

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function parseArgs(value: string): Array<string> | undefined {
  const items = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  return items.length > 0 ? items : undefined
}

function buildDraft(server?: McpServer | null): ServerDraft {
  if (!server) return EMPTY_DRAFT
  return {
    name: server.name,
    transport: server.transport,
    command: server.command ?? '',
    args: (server.args ?? []).join(', '),
    envText: recordToLines(server.env),
    url: server.url ?? '',
    headersText: recordToLines(server.headers),
    timeout: server.timeout ? String(server.timeout) : '',
  }
}

function formatServerSummary(server: McpServer): string {
  if (server.transport === 'http') return server.url || 'No URL configured'
  const args = server.args?.join(' ') || ''
  return (
    [server.command, args].filter(Boolean).join(' ').trim() ||
    'No command configured'
  )
}

function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9_./:@${}-]+$/.test(value)) return value
  return JSON.stringify(value)
}

function yamlArray(values: Array<string>): string {
  return `[${values.map((value) => yamlScalar(value)).join(', ')}]`
}

function yamlMap(value: Record<string, string>, indent: string): Array<string> {
  return Object.entries(value).map(
    ([key, entry]) => `${indent}${key}: ${yamlScalar(entry)}`,
  )
}

function buildYamlSnippet(servers: Array<McpServer>): string {
  if (servers.length === 0) return 'mcp_servers: {}'

  const lines = ['mcp_servers:']
  for (const server of servers) {
    lines.push(`  ${server.name}:`)
    if (server.transport === 'http') {
      if (server.url) lines.push(`    url: ${yamlScalar(server.url)}`)
      if (server.headers && Object.keys(server.headers).length > 0) {
        lines.push('    headers:')
        lines.push(...yamlMap(server.headers, '      '))
      }
    } else {
      if (server.command)
        lines.push(`    command: ${yamlScalar(server.command)}`)
      if (server.args && server.args.length > 0) {
        lines.push(`    args: ${yamlArray(server.args)}`)
      }
      if (server.env && Object.keys(server.env).length > 0) {
        lines.push('    env:')
        lines.push(...yamlMap(server.env, '      '))
      }
    }
    if (typeof server.timeout === 'number')
      lines.push(`    timeout: ${server.timeout}`)
    if (typeof server.connectTimeout === 'number') {
      lines.push(`    connect_timeout: ${server.connectTimeout}`)
    }
    if (
      server.auth &&
      typeof server.auth === 'object' &&
      !Array.isArray(server.auth)
    ) {
      lines.push('    auth:')
      lines.push(
        ...Object.entries(server.auth as Record<string, unknown>).map(
          ([key, value]) => `      ${key}: ${yamlScalar(String(value))}`,
        ),
      )
    }
  }

  return lines.join('\n')
}

function validateDraft(
  draft: ServerDraft,
  existingNames: Array<string>,
  originalName?: string,
): string | null {
  const name = draft.name.trim()
  if (!name) return 'Server name is required.'
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    return 'Use letters, numbers, underscores, or hyphens for the server name.'
  }
  if (existingNames.includes(name) && name !== originalName) {
    return 'A server with that name already exists.'
  }
  if (draft.transport === 'stdio' && !draft.command.trim()) {
    return 'Command is required for stdio servers.'
  }
  if (draft.transport === 'http' && !draft.url.trim()) {
    return 'URL is required for HTTP servers.'
  }
  if (draft.timeout.trim()) {
    const timeout = Number(draft.timeout)
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return 'Timeout must be a positive number.'
    }
  }
  return null
}

function ServerDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: ServerDraft
  setDraft: React.Dispatch<React.SetStateAction<ServerDraft>>
  onSave: () => void
  editingName?: string
}) {
  const { open, onOpenChange, draft, setDraft, onSave, editingName } = props

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(720px,96vw)]">
        <div className="space-y-5 p-5 md:p-6">
          <div className="space-y-1">
            <DialogTitle>
              {editingName ? 'Edit MCP Server' : 'Add MCP Server'}
            </DialogTitle>
            <DialogDescription>
              Configure the server details, then generate an updated YAML
              snippet.
            </DialogDescription>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary-600">
                Name
              </span>
              <Input
                value={draft.name}
                placeholder="filesystem"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <div className="md:col-span-2">
              <Tabs
                value={draft.transport}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    transport: value as Transport,
                  }))
                }
              >
                <TabsList className="rounded-xl border border-primary-200 bg-primary-50 p-1">
                  <TabsTrigger value="stdio">Stdio</TabsTrigger>
                  <TabsTrigger value="http">HTTP</TabsTrigger>
                </TabsList>
                <TabsContent value="stdio" className="mt-4 space-y-4">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary-600">
                      Command
                    </span>
                    <Input
                      value={draft.command}
                      placeholder="npx"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          command: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary-600">
                      Args
                    </span>
                    <Input
                      value={draft.args}
                      placeholder="-y, @modelcontextprotocol/server-filesystem, /tmp"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          args: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary-600">
                      Env Vars
                    </span>
                    <textarea
                      value={draft.envText}
                      rows={4}
                      placeholder={'API_KEY=${MCP_API_KEY}\nLOG_LEVEL=debug'}
                      className="min-h-[108px] w-full rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          envText: event.target.value,
                        }))
                      }
                    />
                  </label>
                </TabsContent>
                <TabsContent value="http" className="mt-4 space-y-4">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary-600">
                      URL
                    </span>
                    <Input
                      value={draft.url}
                      placeholder="https://api.github.com/mcp"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          url: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary-600">
                      Headers
                    </span>
                    <textarea
                      value={draft.headersText}
                      rows={4}
                      placeholder={
                        'Authorization=Bearer ${GITHUB_TOKEN}\nX-Workspace=claude'
                      }
                      className="min-h-[108px] w-full rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          headersText: event.target.value,
                        }))
                      }
                    />
                  </label>
                </TabsContent>
              </Tabs>
            </div>

            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary-600">
                Timeout (seconds)
              </span>
              <Input
                type="number"
                min={1}
                value={draft.timeout}
                placeholder="30"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    timeout: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose>Cancel</DialogClose>
            <Button onClick={onSave}>
              {editingName ? 'Save Changes' : 'Add Server'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}

export function McpSettingsScreen() {
  const [servers, setServers] = useState<Array<McpServer>>([])
  const [originalServers, setOriginalServers] = useState<Array<McpServer>>([])
  const [loading, setLoading] = useState(true)
  const [reloadPending, setReloadPending] = useState(false)
  const [reloadAvailable, setReloadAvailable] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingName, setEditingName] = useState<string | undefined>()
  const [draft, setDraft] = useState<ServerDraft>(EMPTY_DRAFT)

  useEffect(() => {
    async function loadServers() {
      setLoading(true)
      try {
        const response = await fetch('/api/mcp/servers')
        const payload = (await response
          .json()
          .catch(() => ({}))) as McpServersResponse
        const loadedServers = Array.isArray(payload.servers)
          ? payload.servers
          : []
        setServers(loadedServers)
        setOriginalServers(loadedServers)
        if (payload.ok === false) setReloadAvailable(false)
        setNotice(payload.message ?? null)
      } catch {
        setNotice(
          'Could not load MCP config from Hermes Agent. You can still draft servers here.',
        )
      } finally {
        setLoading(false)
      }
    }

    void loadServers()
  }, [])

  const yamlSnippet = useMemo(() => buildYamlSnippet(servers), [servers])

  const isDirty = useMemo(() => {
    return JSON.stringify(servers) !== JSON.stringify(originalServers)
  }, [servers, originalServers])

  function openAddDialog() {
    setEditingName(undefined)
    setDraft(EMPTY_DRAFT)
    setDialogOpen(true)
  }

  function openEditDialog(server: McpServer) {
    setEditingName(server.name)
    setDraft(buildDraft(server))
    setDialogOpen(true)
  }

  function handleSave() {
    const error = validateDraft(
      draft,
      servers.map((server) => server.name),
      editingName,
    )

    if (error) {
      toast(error, { type: 'error' })
      return
    }

    const nextServer: McpServer = {
      ...(servers.find((server) => server.name === editingName) ?? {}),
      name: draft.name.trim(),
      transport: draft.transport,
      command: draft.transport === 'stdio' ? draft.command.trim() : undefined,
      args: draft.transport === 'stdio' ? parseArgs(draft.args) : undefined,
      env:
        draft.transport === 'stdio'
          ? parseKeyValueLines(draft.envText)
          : undefined,
      url: draft.transport === 'http' ? draft.url.trim() : undefined,
      headers:
        draft.transport === 'http'
          ? parseKeyValueLines(draft.headersText)
          : undefined,
      timeout: draft.timeout.trim() ? Number(draft.timeout) : undefined,
    }

    setServers((current) => {
      const remaining = current.filter((server) => server.name !== editingName)
      return [...remaining, nextServer].sort((a, b) =>
        a.name.localeCompare(b.name),
      )
    })
    setDialogOpen(false)
    toast(
      editingName
        ? 'MCP server updated in local draft.'
        : 'MCP server added to local draft.',
      {
        type: 'success',
      },
    )
  }

  async function handleCopySnippet() {
    try {
      await writeTextToClipboard(yamlSnippet)
      setOriginalServers(servers)
      toast('YAML snippet copied.', { type: 'success' })
    } catch {
      toast('Clipboard unavailable.', { type: 'error' })
    }
  }

  async function handleReload() {
    setReloadPending(true)
    try {
      const response = await fetch('/api/mcp/reload', { method: 'POST' })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
      }
      toast(
        payload.message ||
          (payload.ok ? 'Reload requested.' : 'Reload unavailable.'),
        {
          type: payload.ok ? 'success' : 'info',
        },
      )
    } catch {
      toast('Could not reach reload endpoint.', { type: 'error' })
    } finally {
      setReloadPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface text-primary-900">
      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-6 pb-24 sm:px-6 md:flex-row md:gap-6 md:pb-8 lg:pt-8">
        <SettingsSidebar activeId="mcp" />

        <SettingsMobilePills activeId="mcp" />

        <div className="flex-1 min-w-0 space-y-5">
          <header className="rounded-2xl border border-primary-200 bg-primary-50/80 p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 w-fit"
                  render={
                    <Link to="/settings" search={{}}>
                      <HugeiconsIcon
                        icon={ArrowLeft01Icon}
                        size={16}
                        strokeWidth={1.8}
                      />
                      Back to Settings
                    </Link>
                  }
                />
                <div>
                  <h1 className="text-lg font-semibold text-primary-900">
                    MCP Servers
                  </h1>
                  <p className="mt-1 text-sm text-primary-600">
                    Review configured MCP servers, draft changes locally, and
                    copy the YAML into
                    <code className="mx-1 rounded border border-primary-200 bg-primary-100 px-1.5 py-0.5 font-mono text-xs">
                      config.yaml
                    </code>
                    until gateway config writes land.
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={openAddDialog}>
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
                Add Server
              </Button>
            </div>
          </header>

          {notice ? (
            <div className="rounded-2xl border border-primary-200 bg-primary-100 px-4 py-3 text-sm text-primary-600 shadow-sm">
              {notice}
            </div>
          ) : null}

          {isDirty ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 shadow-sm">
              You have unsaved changes. Copy the YAML below and paste it into
              your{' '}
              <code className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs">
                config.yaml
              </code>
              .
            </div>
          ) : null}

          <section className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm md:p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-medium text-primary-900">
                  Configured Servers
                </h2>
                <p className="mt-1 text-xs text-primary-600">
                  {servers.length} server{servers.length === 1 ? '' : 's'} in
                  the current local draft.
                </p>
              </div>
              {reloadAvailable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReload}
                  disabled={reloadPending}
                >
                  <HugeiconsIcon
                    icon={RefreshIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                  {reloadPending ? 'Reloading...' : 'Reload MCP Servers'}
                </Button>
              ) : (
                <span
                  className="text-xs text-primary-400"
                  title="MCP reload not available on this gateway"
                >
                  Reload unavailable
                </span>
              )}
            </div>

            {loading ? (
              <div className="rounded-xl border border-primary-200 bg-primary-100 px-4 py-3 text-sm text-primary-600">
                Loading MCP servers...
              </div>
            ) : null}

            {!loading && servers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-primary-300 bg-primary-100 px-4 py-8 text-center text-sm text-primary-600">
                No MCP servers found yet. Add one to generate a starter config
                snippet.
              </div>
            ) : null}

            {servers.length > 0 ? (
              <div className="grid gap-3">
                {servers.map((server) => (
                  <article
                    key={server.name}
                    className="rounded-2xl border border-primary-200 bg-primary-100 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg">
                            {server.transport === 'http' ? '🌐' : '📡'}
                          </span>
                          <h3 className="text-sm font-semibold text-primary-900">
                            {server.name}
                          </h3>
                          <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary-700">
                            {server.transport}
                          </span>
                        </div>
                        <p className="truncate text-sm text-primary-700">
                          {formatServerSummary(server)}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-primary-500">
                          <span>
                            timeout:{' '}
                            {server.timeout ? `${server.timeout}s` : 'default'}
                          </span>
                          {server.connectTimeout ? (
                            <span>connect: {server.connectTimeout}s</span>
                          ) : null}
                          {server.auth ? <span>auth configured</span> : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(server)}
                        >
                          <HugeiconsIcon
                            icon={Edit01Icon}
                            size={14}
                            strokeWidth={1.8}
                          />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            'text-red-500 hover:bg-red-500/10 hover:text-red-400',
                          )}
                          onClick={() => {
                            setServers((current) =>
                              current.filter(
                                (entry) => entry.name !== server.name,
                              ),
                            )
                            toast(`Removed ${server.name} from local draft.`, {
                              type: 'success',
                            })
                          }}
                        >
                          <HugeiconsIcon
                            icon={Delete02Icon}
                            size={14}
                            strokeWidth={1.8}
                          />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-primary-900">
                  Generated YAML
                </h2>
                <p className="mt-1 text-sm text-primary-600">
                  Add this to your{' '}
                  <code className="rounded border border-primary-200 bg-primary-100 px-1.5 py-0.5 font-mono text-xs">
                    config.yaml
                  </code>{' '}
                  under{' '}
                  <code className="rounded border border-primary-200 bg-primary-100 px-1.5 py-0.5 font-mono text-xs">
                    mcp_servers
                  </code>
                  .
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopySnippet}>
                <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.8} />
                Copy to Clipboard
              </Button>
            </div>

            <pre className="mt-4 overflow-x-auto rounded-2xl border border-primary-200 bg-surface p-4 text-xs leading-6 text-primary-800">
              <code>{yamlSnippet}</code>
            </pre>
          </section>
        </div>
      </main>

      <ServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        setDraft={setDraft}
        onSave={handleSave}
        editingName={editingName}
      />
    </div>
  )
}
