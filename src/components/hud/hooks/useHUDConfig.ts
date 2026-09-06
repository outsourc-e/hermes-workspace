import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HUDConfig } from '../../../server/hud/types'

export function useHUDConfig() {
  return useQuery<HUDConfig>({
    queryKey: ['hud', 'config'],
    queryFn: async () => {
      const r = await fetch('/api/hud/config')
      if (!r.ok) throw new Error('config fetch failed')
      return r.json()
    },
  })
}

export function useHUDConfigPatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<HUDConfig>) => {
      const r = await fetch('/api/hud/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) throw new Error('config patch failed')
      return r.json() as Promise<HUDConfig>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hud', 'config'] }),
  })
}
