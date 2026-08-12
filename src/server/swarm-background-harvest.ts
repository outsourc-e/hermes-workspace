/**
 * Server-side background harvest loop.
 *
 * Polls all executing missions every HARVEST_INTERVAL_MS and calls
 * syncSwarmMissionCheckpoints so worker results are picked up even when
 * the browser client is not connected (tab closed, long-running worker, etc.).
 *
 * This module self-starts on first import (module singleton pattern).
 */

import { listSwarmMissions } from './swarm-missions'
import { syncSwarmMissionCheckpoints } from './swarm-mission-sync'

const HARVEST_INTERVAL_MS = 15_000 // 15 seconds

let started = false

export function startBackgroundHarvest(): void {
  if (started) return
  started = true

  const tick = async () => {
    try {
      const active = listSwarmMissions(50).filter(
        (m) => m.state === 'executing' || m.state === 'reviewing',
      )
      for (const mission of active) {
        await syncSwarmMissionCheckpoints(mission.id).catch(() => {})
      }
    } catch {
      // Never let a harvest error crash the background loop.
    }
  }

  // Run immediately on startup, then on interval.
  void tick()
  setInterval(() => void tick(), HARVEST_INTERVAL_MS)
}

// Auto-start when this module is first imported.
startBackgroundHarvest()
