/**
 * GET /api/spotify/now
 *
 * Returns currently playing track from Spotify.
 * Uses long-lived access token from ~/.hermes/.env (SPOTIFY_ACCESS_TOKEN).
 * Refreshes token if expired using SPOTIFY_REFRESH_TOKEN.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'

type SpotifyTrack = {
  name: string
  artist: string
  album: string
  albumArt: string
  isPlaying: boolean
  progressMs: number
  durationMs: number
}

async function getSpotifyToken(): Promise<string | null> {
  const envPath = join(homedir(), '.hermes', '.env')
  if (!existsSync(envPath)) return null

  const content = readFileSync(envPath, 'utf8')
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.startsWith('SPOTIFY_ACCESS_TOKEN=')) {
      return line.split('=')[1].trim()
    }
  }
  return null
}

async function fetchNowPlaying(
  accessToken: string,
): Promise<SpotifyTrack | null> {
  const r = await fetch(
    'https://api.spotify.com/v1/me/player/currently-playing',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  if (r.status === 204 || r.status === 404) return null
  if (r.status === 401) return null // token expired

  const data = await r.json()

  if (!data || !data.item) return null

  return {
    name: data.item.name,
    artist: data.item.artists.map((a: { name: string }) => a.name).join(', '),
    album: data.item.album.name,
    albumArt: data.item.album.images[0]?.url ?? '',
    isPlaying: data.is_playing,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms ?? 0,
  }
}

export const Route = createFileRoute('/api/spotify/now')({
  server: {
    handlers: {
      GET: async () => {
        const token = await getSpotifyToken()
        if (!token) return json(null)

        const track = await fetchNowPlaying(token)
        return json(track ?? null)
      },
    },
  },
})
