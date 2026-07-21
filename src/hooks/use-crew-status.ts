import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export type CrewPlatformInfo = {
  state: 'connected' | 'disconnected' | string
  updatedAt: string
}

export type CrewMember = {
  id: string
  displayName: string
  humanLabel?: string
  role: string
  specialty?: string
  mission?: string
  skills?: Array<string>
  capabilities?: Array<string>
  profileFound: boolean
  gatewayState: 'running' | 'stopped' | 'unknown' | string
  processAlive: boolean
  platforms: Record<string, CrewPlatformInfo>
  model: string
  provider: string
  lastSessionTitle: string | null
  lastSessionAt: number | null
  sessionCount: number
  messageCount: number
  toolCallCount: number
  totalTokens: number
  estimatedCostUsd: number | null
  cronJobCount: number
  assignedTaskCount: number
}

export type CrewStatus = {
  crew: Array<CrewMember>
  fetchedAt: number
}

export type CrewOnlineStatus = 'online' | 'offline' | 'unknown'

export function getOnlineStatus(member: CrewMember): CrewOnlineStatus {
  if (!member.profileFound) return 'unknown'
  if (member.gatewayState === 'unknown') return 'unknown'
  if (member.gatewayState === 'running' && member.processAlive) return 'online'
  return 'offline'
}

const QUERY_KEY = ['crew', 'status'] as const
const POLL_INTERVAL_MS = 30_000

async function fetchCrewStatus(): Promise<CrewStatus> {
  const res = await fetch('/api/crew-status')
  if (!res.ok) throw new Error(`Failed to fetch crew status: ${res.status}`)
  return res.json() as Promise<CrewStatus>
}

export function useCrewStatus() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchCrewStatus,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  })

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility)
  }, [queryClient])

  return {
    crew: query.data?.crew ?? [],
    lastUpdated: query.data?.fetchedAt ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
