import type { WidgetId } from '../types'

export interface SourceAdapter<T = unknown> {
  id: WidgetId
  ttlMs: number
  fetch: () => Promise<T>
}

// Adapter registry — populated by Task B.3+
export const adapterRegistry: Array<SourceAdapter> = []

export function registerAdapter(a: SourceAdapter) {
  if (!adapterRegistry.find((x) => x.id === a.id)) adapterRegistry.push(a)
}
