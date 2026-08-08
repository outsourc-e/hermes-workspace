/**
 * Agent Swarm Store — tracks live agent sessions for swarm UI rendering.
 */
import { create } from 'zustand'
import type { GatewaySession } from '@/lib/gateway-api'

export type SwarmSession = GatewaySession & {
  /** Derived status for UI rendering */
  swarmStatus: 'running' | 'thinking' | 'complete' | 'failed' | 'error' | 'idle'
  /** Time since last update in ms */
  staleness: number
}

type SwarmState = {
  sessions: SwarmSession[]
}

export const useSwarmStore = create<SwarmState>(() => ({
  sessions: [],
}))
