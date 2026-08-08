import { useAuthSession } from '@/hooks/use-auth-session'
import { checkAuthNow } from '@/lib/auth-session-store'

type ClaudeHealthBannerProps = {
  enabled?: boolean
}

export function ClaudeHealthBanner({
  enabled = false,
}: ClaudeHealthBannerProps) {
  const authSession = useAuthSession()

  if (!enabled) return null
  if (authSession.phase !== 'unreachable' && authSession.phase !== 'suspended') {
    return null
  }

  const suspended = authSession.phase === 'suspended'
  const message = suspended
    ? 'Hermes Agent unreachable — automatic retries suspended'
    : `Hermes Agent unreachable${authSession.lastError ? ` — ${authSession.lastError}` : ''}`

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium"
      style={{
        background: 'var(--theme-danger)',
        color: '#fff',
      }}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse" />
      <span>{message}</span>
      <button
        type="button"
        onClick={() => {
          void checkAuthNow('banner-retry')
        }}
        className="ml-2 rounded px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ background: 'rgba(255,255,255,0.2)' }}
      >
        Retry
      </button>
    </div>
  )
}
