import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import {
  conductorSpawn,
  coordinatorAction,
  fetchMissionList,
  fetchMissionMetrics,
  fetchMissionSnapshot,
} from '../api'
import type {
  ListResponse,
  MetricsResponse,
  Snapshot,
  SpawnResponse,
} from '../types'

export function useCoordinator(selectedMissionId: string | null) {
  const queryClient = useQueryClient()

  const missions = useQuery<ListResponse>({
    queryKey: ['coordinator-conductor-missions'],
    queryFn: fetchMissionList,
    refetchInterval: 5_000,
  })

  const metrics = useQuery<MetricsResponse>({
    queryKey: ['coordinator-conductor-metrics'],
    queryFn: fetchMissionMetrics,
    refetchInterval: 5_000,
  })

  const snapshot = useQuery<Snapshot>({
    queryKey: ['coordinator-conductor-snapshot', selectedMissionId],
    enabled: Boolean(selectedMissionId),
    queryFn: () => fetchMissionSnapshot(selectedMissionId!),
    refetchInterval: 3_000,
  })

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['coordinator-conductor-missions'],
    })
    await queryClient.invalidateQueries({
      queryKey: ['coordinator-conductor-metrics'],
    })
    if (selectedMissionId) {
      await queryClient.invalidateQueries({
        queryKey: ['coordinator-conductor-snapshot', selectedMissionId],
      })
    }
  }, [queryClient, selectedMissionId])

  const actionMutation = useMutation({
    mutationFn: coordinatorAction,
    onSuccess: () => invalidate(),
  })

  const spawnMutation = useMutation({
    mutationFn: conductorSpawn,
    onSuccess: () => invalidate(),
  })

  const run = useCallback(
    (body: Record<string, unknown>) => actionMutation.mutateAsync(body),
    [actionMutation],
  )

  const spawn = useCallback(
    (body: Record<string, unknown>) => spawnMutation.mutateAsync(body),
    [spawnMutation],
  )

  const selectedMission = useMemo(
    () =>
      missions.data?.missions?.find(
        (mission) => mission.id === selectedMissionId,
      ) ?? null,
    [missions.data, selectedMissionId],
  )

  return {
    missions,
    metrics,
    snapshot,
    selectedMission,
    run,
    spawn,
    isPending: actionMutation.isPending || spawnMutation.isPending,
    invalidate,
  }
}
