import { useEffect, useRef, useState } from 'react'
import type { AuthStatus } from '@/lib/claude-auth'
import { writeTextToClipboard } from '@/lib/clipboard'
import { fetchClaudeAuthStatus } from '@/lib/claude-auth'

const POLL_INTERVAL_MS = 2_000
const FAILURE_REVEAL_MS = 5_000
// Fire one silent auto-start attempt this many ms after we still can't connect.
const AUTO_START_DELAY_MS = 4_000

type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function getSetupSteps(
  platform: Platform,
): Array<{ title: string; command: string; note?: string }> {
  return [
    {
      title: 'Use any OpenAI-compatible backend',
      command: 'Set HERMES_API_URL to your backend base URL',
      note: 'Portable chat works with any backend that exposes /v1/chat/completions (Ollama, LiteLLM, vLLM, etc.)',
    },
    {
      title: 'Optional: install Nova gateway locally',
      command:
        'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash',
      note: 'Vanilla hermes-agent unlocks sessions, skills, memory, jobs, and config automatically - no fork required',
    },
    {
      title: 'Set up your agent',
      command: 'hermes setup',
      note: 'Pick your providers once; Nova gateway stores them under ~/.hermes',
    },
    {
      title: 'Start the gateway',
      command: 'hermes gateway run',
      note: 'This starts the HTTP API on :8642 for the workspace',
    },
  ]
}

type Props = { onConnected: (status: AuthStatus) => void }

declare global {
  interface Window {
    __dismissSplash?: () => void
  }
}

export function ConnectionStartupScreen({ onConnected }: Props) {
  const [showFailureState, setShowFailureState] = useState(false)
  const [serverStarting, setServerStarting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverLog, setServerLog] = useState<Array<string>>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [showManual, setShowManual] = useState(false)

  const platform = useRef<Platform>(detectPlatform())
  const steps = getSetupSteps(platform.current)

  const onConnectedRef = useRef(onConnected)
  useEffect(() => {
    onConnectedRef.current = onConnected
  }, [onConnected])

  const isDone = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismiss = window.__dismissSplash
    if (!dismiss) return
    const timer = setTimeout(() => dismiss(), 60)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    isDone.current = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let autoStartTimer: ReturnType<typeof setTimeout> | null = null
    let autoStartFired = false

    const failureTimer = setTimeout(() => {
      if (!isDone.current) {
        setShowFailureState(true)
      }
    }, FAILURE_REVEAL_MS)

    // After a short grace period, fire /api/start-claude once silently.
    // If hermes-agent is installed and just not running, this brings it back
    // up without making the user click anything. The polling loop will see it.
    const fireSilentAutoStart = async () => {
      if (autoStartFired || isDone.current) return
      autoStartFired = true
      try {
        const res = await fetch('/api/start-claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return
        const data = (await res.json()) as { ok?: boolean; message?: string }
        if (res.ok && data.ok) {
          // surface a one-line note so users see what happened if they're
          // looking at the failure panel
          setServerLog([
            String(
              data.message ||
                'Auto-started Nova gateway - reconnecting...',
            ),
          ])
        }
      } catch {
        // silent: manual auto-start button stays available
      }
    }
    autoStartTimer = setTimeout(() => {
      void fireSilentAutoStart()
    }, AUTO_START_DELAY_MS)

    const tryConnect = async () => {
      try {
        const status = await fetchClaudeAuthStatus()
        if (isDone.current) return
        isDone.current = true
        clearTimeout(failureTimer)
        clearTimeout(autoStartTimer)
        if (pollTimer) clearTimeout(pollTimer)
        onConnectedRef.current(status)
      } catch {
        if (isDone.current) return
        pollTimer = setTimeout(tryConnect, POLL_INTERVAL_MS)
      }
    }

    void tryConnect()

    return () => {
      isDone.current = true
      if (pollTimer) clearTimeout(pollTimer)
      clearTimeout(autoStartTimer)
      clearTimeout(failureTimer)
    }
  }, [])

  useEffect(() => {
    if (copiedIdx === null) return
    const timer = setTimeout(() => setCopiedIdx(null), 2_000)
    return () => clearTimeout(timer)
  }, [copiedIdx])

  const handleCopy = async (text: string, idx: number) => {
    try {
      await writeTextToClipboard(text)
      setCopiedIdx(idx)
    } catch {
      /* clipboard not available */
    }
  }

  const handleAutoStart = async () => {
    setServerStarting(true)
    setServerError(null)
    setServerLog(['Looking for hermes-agent...'])
    try {
      const res = await fetch('/api/start-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const msg = `Unexpected response (${res.status})`
        setServerLog([`Error: ${msg}`])
        setServerError(msg)
        setServerStarting(false)
        return
      }

      const data = (await res.json()) as Record<string, unknown>
      if (res.ok && data.ok) {
        setServerLog([
          String(data.message || 'Started - waiting for connection...'),
        ])
        setServerStarting(false)
        return
      }

      const msg = String(data.error || 'Could not find hermes-agent')
      const hint = data.hint ? String(data.hint) : ''
      setServerLog([`Error: ${msg}`])
      if (hint) setServerLog((prev) => [...prev, `Hint: ${hint}`])
      setServerError(msg)
      setServerStarting(false)
      // Show manual steps when auto-start fails
      setShowManual(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setServerLog([`Failed: ${msg}`])
      setServerError(msg)
      setServerStarting(false)
      setShowManual(true)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-6 py-10 text-[#F7E8C6]"
      style={{
        backgroundColor: '#050A12',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <img
          src="/nova-idle-poster.png"
          alt="Nova"
          className="mb-5 h-24 w-24 rounded-2xl object-cover shadow-[0_12px_40px_rgba(255,140,26,0.28)]"
        />

        <h1 className="text-[2rem] font-semibold tracking-tight text-[#F7E8C6]">
          Nova Mission Control
        </h1>

        {/* Connecting spinner */}
        <div
          className={[
            'mt-4 flex items-center gap-3 text-sm text-[#C8D8EA] transition-opacity duration-300',
            showFailureState ? 'opacity-0 h-0' : 'opacity-100',
          ].join(' ')}
          aria-hidden={showFailureState}
        >
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#36506C] border-t-[#FFB347]" />
          <span>Connection: checking</span>
        </div>

        {/* Failure state - setup guide */}
        <div
          className={[
            'w-full overflow-hidden transition-all duration-500 ease-out',
            showFailureState
              ? 'mt-6 max-h-[60rem] translate-y-0 opacity-100'
              : 'max-h-0 translate-y-2 opacity-0',
          ].join(' ')}
        >
          <div className="w-full rounded-3xl border border-[#29476A] bg-[#0E1A2A] p-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm">
            <p className="text-base font-semibold text-[#F7E8C6]">
              Jack in to your backend
            </p>
            <p className="mt-2 text-sm leading-6 text-[#B8C7D8]">
              Nova can work with any OpenAI-compatible backend. The local
              gateway unlocks richer workspace features when it is available.
            </p>

            {/* Auto-start section */}
            <div className="mt-5">
              <button
                type="button"
                disabled={serverStarting}
                onClick={handleAutoStart}
                className={[
                  'w-full rounded-xl px-5 py-3 text-sm font-semibold transition',
                  serverStarting
                    ? 'cursor-not-allowed bg-[#4B321E] text-[#FFD49A]'
                    : 'bg-[#FF9D2E] text-[#08111D] hover:bg-[#FFB347]',
                ].join(' ')}
              >
                {serverStarting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
                    Detecting...
                  </span>
                ) : (
                  'Jack in'
                )}
              </button>

              {/* Server log */}
              {serverLog.length > 0 ? (
                <div
                  className={[
                    'mt-3 rounded-xl border p-3',
                    serverError
                      ? 'border-[#E07B39] bg-[#2B170F]'
                      : 'border-[#7AA36F] bg-[#102317]',
                  ].join(' ')}
                >
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-[#FFE6BD]">
                    {serverLog.join('\n')}
                  </pre>
                </div>
              ) : null}
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#29476A]" />
              <button
                type="button"
                onClick={() => setShowManual(!showManual)}
                className="text-xs font-medium text-[#8FB2D8] transition hover:text-[#F7E8C6]"
              >
                {showManual ? 'Hide' : 'Show'} manual setup
              </button>
              <div className="h-px flex-1 bg-[#29476A]" />
            </div>

            {/* Manual setup steps */}
            <div
              className={[
                'overflow-hidden transition-all duration-300',
                showManual ? 'max-h-[40rem] opacity-100' : 'max-h-0 opacity-0',
              ].join(' ')}
            >
              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#24405F] bg-[#07111F] p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF9D2E] text-xs font-bold text-[#08111D]">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-[#E8F1FF]">
                          {step.title}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(step.command, idx)}
                        className="shrink-0 rounded-lg border border-[#385A7A] bg-[#10243A] px-2.5 py-1 text-xs font-medium text-[#CFE5FF] transition hover:bg-[#193653] hover:text-white"
                      >
                        {copiedIdx === idx ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-[#020711] p-3 font-mono text-xs leading-5 text-[#FFD49A]">
                      <code>{step.command}</code>
                    </pre>
                    {step.note ? (
                      <p className="mt-2 text-xs leading-5 text-[#9FB3C7]">{step.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Env var hint */}
              <div className="mt-4 rounded-xl border border-[#24405F] bg-[#07111F] p-3">
                <p className="text-xs font-medium text-[#AFC5DC]">
                  Point{' '}
                  <code className="rounded bg-[#10243A] px-1.5 py-0.5 font-mono text-[#FFD49A]">
                    HERMES_API_URL
                  </code>{' '}
                  at any OpenAI-compatible backend:
                </p>
                <pre className="mt-2 overflow-x-auto font-mono text-xs text-[#CFE5FF]">
                  HERMES_API_URL=http://your-server:8642 pnpm dev
                </pre>
              </div>
            </div>
          </div>
        </div>

        {!showFailureState ? (
          <p className="mt-6 text-xs text-[#8FA7BF]">
            This page auto-refreshes when a compatible backend is detected
          </p>
        ) : null}
      </div>
    </div>
  )
}
