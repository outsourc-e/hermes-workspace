import { useQuery } from '@tanstack/react-query';
import type { HUDSnapshot } from '../../../server/hud/types';

export function useHUDSnapshot() {
  return useQuery<HUDSnapshot>({
    queryKey: ['hud', 'snapshot'],
    queryFn: async () => {
      const res = await fetch('/api/hud/snapshot');
      if (!res.ok) throw new Error('snapshot fetch ' + res.status);
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
