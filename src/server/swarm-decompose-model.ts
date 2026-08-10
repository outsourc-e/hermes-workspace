export type SelectableRoute = {
  id: string
  selectable: boolean
}

export function selectSwarmOrchestratorRoute(input: {
  requestedModel?: string | null
  orchestratorModelRef?: string | null
  fallbackModelRef?: string | null
  routes: Array<SelectableRoute>
}): string {
  const requested = input.requestedModel?.trim() || ''
  const configured = input.orchestratorModelRef?.trim() || ''
  const fallback = input.fallbackModelRef?.trim() || ''
  const selected = requested || configured || fallback
  if (!selected) {
    throw new Error('No orchestrator OAuth subscription route is configured')
  }
  const route = input.routes.find((entry) => entry.id === selected)
  if (!route?.selectable) {
    throw new Error(`${selected} is not a selectable OAuth subscription route`)
  }
  return route.id
}
