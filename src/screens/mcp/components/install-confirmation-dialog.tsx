/**
 * Install confirmation dialog for Marketplace entries.
 *
 * Shows a full preview of the MCP server template before install:
 *   - Name, transport, trust badge
 *   - Command (font-mono, own line)
 *   - Args[] (each own line)
 *   - Env keys (values masked as ***)
 *   - Homepage link
 *   - Source label
 *
 * User must click "Install" inside this dialog to commit.
 * If the template contains placeholder values (paths, angle-bracket tokens,
 * empty secret env vars), the first Install click expands an inline fill form.
 * The POST only fires once all detected placeholders are given real values.
 *
 * US-501: placeholder detection + inline fill.
 */
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import type { HubMcpEntry } from '../hooks/use-mcp-hub'
import type { McpClientInput } from '@/types/mcp'
import {
  detectPlaceholders,
  isStillPlaceholder,
} from '../lib/placeholder-detect'
import type { PlaceholderField } from '../lib/placeholder-detect'

interface Props {
  entry: HubMcpEntry | null
  onClose: () => void
  onInstalled?: () => void
}

const TRUST_PILL: Record<
  string,
  { label: string; className: string }
> = {
  official: {
    label: 'Official',
    className: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  },
  community: {
    label: 'Community',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  unverified: {
    label: 'Unverified',
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  },
}

const FIELD =
  'h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-ink outline-none transition-colors focus:border-primary'

/** Apply placeholder overrides to a template copy before POSTing. */
function applyOverrides(
  template: McpClientInput,
  placeholders: Array<PlaceholderField>,
  overrides: Record<string, string>,
): McpClientInput {
  const out: McpClientInput = {
    ...template,
    args: template.args ? [...template.args] : [],
    env: template.env ? { ...template.env } : {},
  }
  for (const ph of placeholders) {
    const val = overrides[ph.path]
    if (val === undefined) continue
    if (ph.kind === 'url') {
      out.url = val
    } else if (ph.kind === 'arg') {
      // Parse index from "args[N]"
      const m = ph.path.match(/^args\[(\d+)\]$/)
      if (m) {
        const idx = parseInt(m[1], 10)
        if (out.args) out.args[idx] = val
      }
    } else if (ph.kind === 'env') {
      // Path is "env.KEY"
      const key = ph.path.slice(4) // strip "env."
      if (out.env) out.env[key] = val
    }
  }
  return out
}

export function InstallConfirmationDialog({ entry, onClose, onInstalled }: Props) {
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Detected placeholders on first click
  const [placeholders, setPlaceholders] = useState<Array<PlaceholderField> | null>(null)
  // User-provided override values, keyed by PlaceholderField.path
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const abortControllerRef = useRef<AbortController | null>(null)

  const open = Boolean(entry)

  /** True when placeholders are detected but not all filled with real values. */
  function hasUnfilledPlaceholders(
    phs: Array<PlaceholderField>,
    ovr: Record<string, string>,
  ): boolean {
    return phs.some((ph) => {
      const val = ovr[ph.path] ?? ''
      return isStillPlaceholder(ph.kind, val)
    })
  }

  async function handleInstall() {
    if (!entry) return

    const template = entry.template

    // First click: detect placeholders. If any exist, show fill form instead of POSTing.
    if (placeholders === null) {
      const detected = detectPlaceholders(template)
      if (detected.length > 0) {
        setPlaceholders(detected)
        return
      }
      // No placeholders — fall through to POST immediately
    } else {
      // Placeholders were already detected; check all filled
      if (hasUnfilledPlaceholders(placeholders, overrides)) {
        return
      }
    }

    const resolvedTemplate =
      placeholders && placeholders.length > 0
        ? applyOverrides(template, placeholders, overrides)
        : template

    const ac = new AbortController()
    abortControllerRef.current = ac
    setInstalling(true)
    setError(null)
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolvedTemplate),
        signal: ac.signal,
      })
      const body = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || body.ok === false) {
        throw new Error(body.error || `Install failed (${res.status})`)
      }
      toast(`Installed ${entry.name}`, { type: 'success', icon: '✓' })
      onInstalled?.()
      onClose()
    } catch (err) {
      // Ignore abort errors — the dialog was closed intentionally
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
      abortControllerRef.current = null
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      // Block close while an install is in-flight; abort it first
      if (installing) {
        abortControllerRef.current?.abort()
        return
      }
      setError(null)
      setPlaceholders(null)
      setOverrides({})
      onClose()
    }
  }

  const trustConfig = entry ? (TRUST_PILL[entry.trust] ?? TRUST_PILL.unverified) : null
  const template = entry?.template
  const envKeys = template?.env ? Object.keys(template.env) : []

  // Determine whether Install button should be disabled
  const installDisabled =
    installing ||
    (placeholders !== null && hasUnfilledPlaceholders(placeholders, overrides))

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(640px,95vw)] border-primary-200 bg-primary-50/95 backdrop-blur-sm">
        {entry && trustConfig && template ? (
          <div className="flex flex-col gap-4 p-1">
            {/* Header */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-balance text-lg font-medium text-ink">
                  {entry.name}
                </DialogTitle>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${trustConfig.className}`}
                >
                  {trustConfig.label}
                </span>
                <span className="rounded-md border border-primary-200 bg-primary-100/60 px-2 py-0.5 text-[11px] font-medium text-primary-500">
                  {template.transportType}
                </span>
              </div>
              <DialogDescription className="text-sm text-primary-500 text-pretty">
                {entry.description || 'No description provided.'}
              </DialogDescription>
            </div>

            {/* Template preview */}
            <div className="rounded-xl border border-primary-200 bg-primary-100/40 p-4 space-y-3 text-sm">
              {/* Command */}
              {template.command ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-primary-400 tracking-wide">
                    Command
                  </p>
                  <p className="font-mono text-ink break-all">{template.command}</p>
                </div>
              ) : null}

              {/* Args */}
              {template.args && template.args.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-primary-400 tracking-wide">
                    Args
                  </p>
                  <ul className="space-y-0.5">
                    {template.args.map((arg, i) => (
                      <li key={i} className="font-mono text-ink break-all">
                        {arg}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* URL (http transport) */}
              {template.url ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-primary-400 tracking-wide">
                    URL
                  </p>
                  <p className="font-mono text-ink break-all">{template.url}</p>
                </div>
              ) : null}

              {/* Env */}
              {envKeys.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-primary-400 tracking-wide">
                    Environment Variables
                  </p>
                  <ul className="space-y-0.5">
                    {envKeys.map((key) => (
                      <li key={key} className="font-mono text-ink">
                        <span className="text-primary-600">{key}</span>
                        <span className="text-primary-400"> = </span>
                        <span className="text-primary-400">***</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* Placeholder fill form — shown after first Install click when placeholders detected */}
            {placeholders && placeholders.length > 0 ? (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3 dark:border-amber-700 dark:bg-amber-950/20"
                data-testid="placeholder-fill-form"
              >
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  This template contains placeholder values. Fill in the fields below before installing.
                </p>
                {placeholders.map((ph) => (
                  <label key={ph.path} className="flex flex-col gap-1 text-sm text-primary-500">
                    <span className="font-mono text-xs text-primary-600">
                      {ph.path}
                      {ph.currentValue ? (
                        <span className="ml-1 text-primary-400">(was: {ph.currentValue})</span>
                      ) : null}
                    </span>
                    <input
                      className={FIELD}
                      value={overrides[ph.path] ?? ''}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [ph.path]: e.target.value }))
                      }
                      placeholder={`Replace ${ph.currentValue || ph.path}`}
                      data-testid={`placeholder-input-${ph.path}`}
                    />
                  </label>
                ))}
              </div>
            ) : null}

            {/* Meta */}
            <div className="space-y-1 text-xs text-primary-500">
              {entry.homepage ? (
                <p>
                  Homepage:{' '}
                  <a
                    href={entry.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-border underline-offset-4 hover:decoration-primary"
                  >
                    {entry.homepage}
                  </a>
                </p>
              ) : null}
              <p>
                Source:{' '}
                <span className="font-medium text-ink">{entry.source}</span>
              </p>
            </div>

            {/* Error */}
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 border-t border-primary-200 pt-3">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={installing}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={installDisabled}
                onClick={handleInstall}
                data-testid="install-confirm-btn"
              >
                {installing ? 'Installing…' : 'Install'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </DialogRoot>
  )
}
