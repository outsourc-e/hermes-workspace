import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

type Props = {
  feature: string
  description?: string
  state?: 'unavailable' | 'error'
  onRetry?: () => void | Promise<unknown>
  repairCommand?: string
  settingsHref?: string
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
}

export function BackendUnavailableState({
  feature,
  description,
  state = 'unavailable',
  onRetry,
  repairCommand = 'hermes gateway run',
  settingsHref = '/settings',
}: Props) {
  const [retrying, setRetrying] = useState(false)
  const [copied, setCopied] = useState(false)
  const isError = state === 'error'

  async function retry() {
    if (!onRetry || retrying) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  async function copyRepairCommand() {
    await copyText(repairCommand)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-primary-200 bg-primary-50/70 p-8 text-center shadow-sm backdrop-blur-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary-200 bg-white text-primary-600 shadow-sm">
          <HugeiconsIcon icon={Alert02Icon} size={24} strokeWidth={1.7} />
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-500">
            {isError ? 'Capability check failed' : 'Capability unavailable'}
          </p>
          <h2 className="text-lg font-semibold text-primary-900">{feature}</h2>
          <p className="text-sm leading-6 text-primary-600">
            {isError
              ? `Workspace could not verify ${feature}. No repair action was run automatically.`
              : `The connected backend does not currently expose ${feature}.`}
          </p>
          {description ? (
            <p className="text-xs leading-5 text-primary-500">{description}</p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="min-h-10 rounded-lg bg-primary-900 px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {retrying ? 'Checking…' : 'Retry check'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void copyRepairCommand()}
            className="min-h-10 rounded-lg border border-primary-300 bg-white px-4 text-sm font-semibold text-primary-800"
          >
            {copied ? 'Copied' : 'Copy repair command'}
          </button>
          <a
            href={settingsHref}
            className="inline-flex min-h-10 items-center rounded-lg border border-primary-300 bg-white px-4 text-sm font-semibold text-primary-800"
          >
            Open Settings
          </a>
        </div>

        <details className="mt-5 rounded-xl border border-primary-200 bg-white/70 px-3 py-2 text-left">
          <summary className="cursor-pointer text-xs font-semibold text-primary-700">
            Manual repair details
          </summary>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-primary-950 px-3 py-2 text-xs text-white">
            {repairCommand}
          </code>
          <p className="mt-2 text-[11px] leading-5 text-primary-500">
            Copying does not execute the command or change configuration.
          </p>
        </details>
      </div>
    </div>
  )
}

export default BackendUnavailableState
