import { useRouterState } from '@tanstack/react-router'
import { isTruthyWarRoomFlag } from '../../lib/war-room/living-v3/route-flags'
import { LivingWarRoomV3 } from './living-v3/LivingWarRoomV3'

export function WarRoomScreen() {
  const routeSearch = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  })

  const etsyFocusMode = isTruthyWarRoomFlag(routeSearch.etsyFocus)
  const goblinFocusMode = isTruthyWarRoomFlag(routeSearch.goblinOps) || isTruthyWarRoomFlag(routeSearch.goblinFocus)

  return (
    <LivingWarRoomV3
      bodyRuntimeMode={isTruthyWarRoomFlag(routeSearch.bodyRuntime) ? 'body-runtime' : 'local-adapter'}
      etsyFocusMode={etsyFocusMode}
      goblinFocusMode={goblinFocusMode}
    />
  )
}
