/** UI-only Hermes nodes that must not receive swarm task dispatch. */
export const SWARM_NON_DISPATCH_WORKER_IDS = ['workspace'] as const

export function isSwarmDispatchWorkerId(workerId: string): boolean {
  const id = workerId.trim()
  if (!id) return false
  return !(SWARM_NON_DISPATCH_WORKER_IDS as ReadonlyArray<string>).includes(id)
}
