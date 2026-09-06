/**
 * Spotify Now-Playing Widget
 * Shows current track, artist, album art from Spotify.
 * Uses Spotify Web API — requires access token.
 */
import { useEffect, useState } from 'react'

type Track = {
  name: string
  artist: string
  album: string
  albumArt: string
  isPlaying: boolean
  progressMs: number
  durationMs: number
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function SpotifyWidget() {
  const [track, setTrack] = useState<Track | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/spotify/now')
      .then((r) => r.json())
      .then((d) => {
        setTrack(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
          Spotify
        </span>
        <div className="text-xs text-[var(--theme-muted)]">loading…</div>
      </div>
    )
  }

  if (!track) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
          Spotify
        </span>
        <div className="text-xs text-[var(--theme-muted)]">not connected</div>
      </div>
    )
  }

  const progress =
    track.durationMs > 0 ? (track.progressMs / track.durationMs) * 100 : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
          {track.isPlaying ? '▶ Now Playing' : '⏸ Paused'}
        </span>
        <svg
          className="h-3 w-3 text-[var(--theme-accent)]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479 1.061.241 1.571-.239.421-.661.48-1.021.24z" />
        </svg>
      </div>

      <div className="flex items-center gap-3">
        {track.albumArt && (
          <img
            src={track.albumArt}
            alt={track.album}
            className="h-10 w-10 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--theme-text)]">
            {track.name}
          </div>
          <div className="truncate text-xs text-[var(--theme-muted)]">
            {track.artist}
          </div>
        </div>
      </div>

      {track.isPlaying && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--theme-muted)]">
            {formatTime(track.progressMs)}
          </span>
          <div className="h-1 flex-1 rounded-full bg-[var(--theme-border)]">
            <div
              className="h-full rounded-full bg-[var(--theme-accent)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-[var(--theme-muted)]">
            {formatTime(track.durationMs)}
          </span>
        </div>
      )}
    </div>
  )
}
