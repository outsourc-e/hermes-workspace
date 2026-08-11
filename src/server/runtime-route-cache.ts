export type RuntimeRouteSnapshotEntry = {
  id: string
  account: string
  model: string
  status: 'available'
}

const MAX_ROUTES = 500
const MAX_FIELD_LENGTH = 200
let snapshot: Array<RuntimeRouteSnapshotEntry> = []

function bounded(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= MAX_FIELD_LENGTH ? normalized : null
}

export function writeRuntimeRouteSnapshot(input: Array<unknown>): void {
  const seen = new Set<string>()
  snapshot = input.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const raw = entry as Record<string, unknown>
    const id = bounded(raw.id)
    const account = bounded(raw.account)
    const model = bounded(raw.model)
    if (!id || !account || !model || raw.status !== 'available' || seen.has(id)) return []
    seen.add(id)
    return [{ id, account, model, status: 'available' as const }]
  }).slice(0, MAX_ROUTES)
}

export function readRuntimeRouteSnapshot(): Array<RuntimeRouteSnapshotEntry> {
  return snapshot.map((entry) => ({ ...entry }))
}

export function clearRuntimeRouteSnapshot(): void {
  snapshot = []
}
