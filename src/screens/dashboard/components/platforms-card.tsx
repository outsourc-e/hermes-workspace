import type { DashboardOverview } from '@/server/dashboard-aggregator'

const PLATFORM_ICONS: Record<string, string> = {
  api_server: '🌐',
  telegram: '✈️',
  discord: '🎮',
  whatsapp: '🟢',
  slack: '💼',
  signal: '🔵',
  matrix: '#',
  nostr: '⚡',
  imessage: '💬',
  bluebubbles: '🫧',
  mattermost: '🔷',
  feishu: '🪶',
  line: '💚',
  zalo: '⭐',
  twitch: '🎬',
  qqbot: '🐧',
  msteams: '🟦',
  irc: '#️⃣',
}

function stateTone(state: string): { color: string; label: string } {
  switch (state.toLowerCase()) {
    case 'connected':
    case 'running':
    case 'ok':
      return { color: 'var(--theme-success)', label: state }
    case 'connecting':
    case 'starting':
      return { color: 'var(--theme-warning)', label: state }
    case 'error':
    case 'disconnected':
    case 'failed':
      return { color: 'var(--theme-danger)', label: state }
    default:
      return { color: 'var(--theme-muted)', label: state || 'unknown' }
  }
}

/**
 * Shows the gateway's connected platforms (api_server, telegram, etc.).
 * Mirrors the native dashboard's PlatformsCard but stays small enough
 * to live alongside the metric tiles. Hidden entirely when there is
 * nothing to show.
 */
export function PlatformsCard({
  platforms,
}: {
  platforms: DashboardOverview['platforms']
}) {
  if (!platforms || platforms.length === 0) return null
  return (
    <div
      className="rounded-md border bg-[var(--theme-card)]/40 p-3"
      style={{ borderColor: 'var(--theme-border)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          Platforms
        </h3>
        <span
          className="text-[10px] font-mono uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {platforms.length} connected
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {platforms.map((platform) => {
          const tone = stateTone(platform.state)
          const icon = PLATFORM_ICONS[platform.name] ?? '🔌'
          return (
            <div
              key={platform.name}
              className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
              style={{ borderColor: 'var(--theme-border)' }}
              title={
                platform.errorMessage
                  ? `${platform.name}: ${platform.errorMessage}`
                  : platform.name
              }
            >
              <span aria-hidden>{icon}</span>
              <span className="flex-1 truncate font-mono text-[11px]">
                {platform.name}
              </span>
              <span
                className="text-[9px] font-mono uppercase tracking-[0.1em]"
                style={{ color: tone.color }}
              >
                {tone.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
