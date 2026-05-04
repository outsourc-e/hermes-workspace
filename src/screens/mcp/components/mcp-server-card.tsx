import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  useConfigureMcpServer,
  useDeleteMcpServer,
  useTestMcpServer,
} from '../hooks/use-mcp-mutations'
import { useMcpCapabilityMode } from '../hooks/use-mcp-capability-mode'
import { useMcpOauth } from '../hooks/use-mcp-oauth'
import { isArgPlaceholder, isUrlPlaceholder } from '../lib/placeholder-detect'
import type { McpServer, McpTestResult } from '@/types/mcp'

interface Props {
  server: McpServer
  onEdit: (server: McpServer) => void
}

const STATUS_COLORS: Record<McpServer['status'], string> = {
  connected:
    'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  failed:
    'border border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200',
  unknown:
    'border border-primary-200 bg-primary-100/60 text-primary-500',
}

function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  )
}

export function McpServerCard({ server, onEdit }: Props) {
  const test = useTestMcpServer()
  const configure = useConfigureMcpServer()
  const remove = useDeleteMcpServer()
  const oauth = useMcpOauth()
  const { mode: capabilityMode } = useMcpCapabilityMode()
  const fallbackMode = capabilityMode === 'fallback'
  // Test + Refresh work in fallback mode via the hermes CLI bridge
  // (workspace shells out to `hermes mcp test <name>`). Logs and Reauth
  // still require the live runtime /api/mcp endpoints.
  const liveOnlyTitle = fallbackMode
    ? 'Requires hermes-agent /api/mcp runtime endpoint (not available in local fallback mode).'
    : ''
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [testResult, setTestResult] = useState<McpTestResult | null>(null)

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50/85 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-ink">
              {server.name}
            </h3>
            <Badge className={STATUS_COLORS[server.status]}>{server.status}</Badge>
            <Badge className="border border-primary-200 bg-primary-100/60 text-primary-500">
              {server.transportType}
            </Badge>
          </div>
          <p className="truncate font-mono text-xs text-primary-500">
            {server.transportType === 'http' ? server.url : server.command}
          </p>
        </div>
        <Switch
          checked={server.enabled}
          disabled={configure.isPending}
          onCheckedChange={(checked) =>
            configure.mutate({ name: server.name, enabled: checked })
          }
          aria-label={server.enabled ? 'Disable server' : 'Enable server'}
        />
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-primary-500">
        <div className="flex items-center gap-1.5">
          <dt>Tools:</dt>
          <dd className="font-medium text-ink tabular-nums">
            {server.discoveredToolsCount}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Auth:</dt>
          <dd className="font-medium text-ink">{server.authType}</dd>
        </div>
      </dl>

      {server.lastError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
          {server.lastError}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <Button
          variant="outline"
          size="sm"
          disabled={test.isPending}
          onClick={async () => {
            const result = await test.mutateAsync({ name: server.name })
            setTestResult(result)
            qc.invalidateQueries({ queryKey: ['mcp', 'servers'] })
          }}
        >
          {test.isPending ? 'Testing…' : 'Test'}
        </Button>
        {server.authType === 'oauth' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={oauth.isPending || fallbackMode}
            title={liveOnlyTitle}
            onClick={() => {
              void oauth.start(server)
            }}
          >
            {oauth.isPending ? 'Reauth…' : 'Reauth'}
          </Button>
        ) : null}
        {/* Logs button hidden until hermes-agent dashboard exposes the
            /api/mcp/{name}/logs SSE endpoint. Re-enable when the runtime
            endpoint is available; the McpLogsDrawer component is still
            available at ./mcp-logs-drawer. */}
        <Button variant="outline" size="sm" onClick={() => onEdit(server)}>
          Edit
        </Button>
        {confirmDelete ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ name: server.name })}
            >
              Confirm Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        )}
      </div>

      {testResult ? (
        <p className="text-xs text-primary-500">
          {testResult.ok
            ? `Connected (${testResult.latencyMs ?? '?'}ms, ${testResult.discoveredTools.length} tools)`
            : `Failed: ${testResult.error || 'unknown error'}`}
        </p>
      ) : null}
      {testResult && !testResult.ok && testResult.error ? (
        (() => {
          const stdioErrorRe = /Connection closed|EACCES|ENOENT|exited unexpectedly/i
          const httpErrorRe = /fetch failed|network error|ENOTFOUND/i
          const hasStdioPlaceholder =
            server.transportType === 'stdio' &&
            server.args.some((a) => isArgPlaceholder(a))
          const hasHttpPlaceholder =
            server.transportType === 'http' &&
            Boolean(server.url && isUrlPlaceholder(server.url))
          const showHint =
            (stdioErrorRe.test(testResult.error) && hasStdioPlaceholder) ||
            (httpErrorRe.test(testResult.error) && hasHttpPlaceholder)
          if (!showHint) return null
          return (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              Edit server args/url — looks like a placeholder. Click Edit to fix.
            </p>
          )
        })()
      ) : null}
      {oauth.isError && oauth.error ? (
        <p className="text-xs text-red-700 dark:text-red-300">
          Reauth failed: {oauth.error.message}
        </p>
      ) : null}
      {oauth.data?.status === 'connected' ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Reauth succeeded.
        </p>
      ) : null}
    </article>
  )
}
