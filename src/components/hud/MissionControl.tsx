import { memo, useEffect, useMemo, useState } from 'react'
import { Tile } from './Tile'
import { useHUDConfig } from './hooks/useHUDConfig'
import type { WidgetSnapshot } from '../../server/hud/types'

export interface MCTileSpec {
  id: string
  snapshot: WidgetSnapshot<{
    value: string
    sub?: string
    tone?: 'ok' | 'warn' | 'err' | 'info'
  }>
  label: string
}
interface MissionControlProps {
  tiles: Array<MCTileSpec>
}

const STORAGE_KEY = 'hud.mc.showHealthy'

function readInitialShowHealthy(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistShowHealthy(value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

/**
 * A tile is "healthy" if it has loaded data with tone='ok' (the explicit
 * green-light state in the Tile component'"'"'s contract). Loading / errored
 * widgets are surfaced regardless because they want attention.
 */
function isHealthy(tile: MCTileSpec): boolean {
  if (tile.snapshot.state !== 'loaded') return false
  return tile.snapshot.data?.tone === 'ok'
}

function MissionControlImpl({ tiles }: MissionControlProps) {
  const { data: cfg } = useHUDConfig()
  const isMobile = useIsMobile()
  const [showHealthy, setShowHealthy] = useState(readInitialShowHealthy)

  const visible = useMemo(() => {
    const mobileSet = new Set(cfg?.mobile_tiles ?? [])
    return isMobile && cfg?.mobile_tiles?.length
      ? tiles.filter((t) => mobileSet.has(t.id as any))
      : tiles
  }, [isMobile, cfg?.mobile_tiles, tiles])

  const { problems, healthy } = useMemo(() => {
    const p: Array<MCTileSpec> = []
    const h: Array<MCTileSpec> = []
    for (const t of visible) (isHealthy(t) ? h : p).push(t)
    return { problems: p, healthy: h }
  }, [visible])

  const toggleHealthy = () => {
    setShowHealthy((prev) => {
      const next = !prev
      persistShowHealthy(next)
      return next
    })
  }

  const renderedTiles = showHealthy ? visible : problems
  const hasHealthyCollapsed = !showHealthy && healthy.length > 0

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
      <div className="text-xs text-[#8b949e] tracking-[0.15em] uppercase font-semibold mb-3 flex justify-between items-center">
        <span>Mission Control</span>
        <span className="flex items-center gap-4 text-[11px] font-normal normal-case tracking-normal">
          <span className="text-[#3fb950]">● live</span>
          {healthy.length > 0 && (
            <button
              type="button"
              onClick={toggleHealthy}
              className="text-[#58a6ff] hover:underline"
              aria-expanded={showHealthy}
            >
              {showHealthy
                ? `Hide ${healthy.length} OK ▴`
                : `Show ${healthy.length} OK ▾`}
            </button>
          )}
        </span>
      </div>

      {renderedTiles.length === 0 && hasHealthyCollapsed && (
        <button
          type="button"
          onClick={toggleHealthy}
          className="w-full text-center py-4 text-sm text-[#3fb950] hover:text-white hover:bg-[#161b22] rounded transition-colors"
        >
          ✓ All systems · {healthy.length} OK
        </button>
      )}

      {renderedTiles.length === 0 && !hasHealthyCollapsed && (
        <div className="text-center py-4 text-sm text-[#6e7681]">
          No widgets to show
        </div>
      )}

      {renderedTiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {renderedTiles.map((t) => (
            <Tile
              key={t.id}
              state={t.snapshot.state}
              label={t.label}
              value={t.snapshot.data?.value ?? '—'}
              sub={t.snapshot.data?.sub}
              tone={t.snapshot.data?.tone}
              fetchedAt={t.snapshot.fetchedAt}
              error={t.snapshot.error}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const MissionControl = memo(MissionControlImpl)
