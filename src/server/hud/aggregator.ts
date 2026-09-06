import type { HUDCache } from './cache'
import type { HUDSnapshot, WidgetId, WidgetSnapshot } from './types'
import type { SourceAdapter } from './sources'

interface RunOptions {
  deadlineMs?: number
  cache?: HUDCache
}

export async function runAggregator(
  adapters: Array<SourceAdapter>,
  opts: RunOptions = {},
): Promise<HUDSnapshot> {
  const deadlineMs = opts.deadlineMs ?? 1500
  const cache = opts.cache
  const widgets = {} as Record<WidgetId, WidgetSnapshot>

  const tasks = adapters.map(async (a) => {
    const cached = cache ? await cache.get(a.id) : null
    const timeout = new Promise<'timeout'>((r) =>
      setTimeout(() => r('timeout'), deadlineMs),
    )

    try {
      const result = await Promise.race([a.fetch(), timeout])
      if (result === 'timeout') {
        widgets[a.id] = cached
          ? {
              id: a.id,
              state: cached.isStale ? 'stale' : 'loaded',
              data: cached.data as any,
              fetchedAt: cached.fetchedAt,
              ttlMs: a.ttlMs,
            }
          : {
              id: a.id,
              state: 'loading',
              data: null,
              fetchedAt: Date.now(),
              ttlMs: a.ttlMs,
            }
      } else {
        widgets[a.id] = {
          id: a.id,
          state: 'loaded',
          data: result,
          fetchedAt: Date.now(),
          ttlMs: a.ttlMs,
        }
        if (cache) await cache.set(a.id, result, a.ttlMs)
      }
    } catch (err: any) {
      widgets[a.id] = cached
        ? {
            id: a.id,
            state: 'errored',
            data: cached.data as any,
            fetchedAt: cached.fetchedAt,
            ttlMs: a.ttlMs,
            error: { message: err.message ?? String(err) },
          }
        : {
            id: a.id,
            state: 'errored',
            data: null,
            fetchedAt: Date.now(),
            ttlMs: a.ttlMs,
            error: { message: err.message ?? String(err) },
          }
    }
  })

  await Promise.all(tasks)
  return { generatedAt: Date.now(), widgets }
}
