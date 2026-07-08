/**
 * Live swarm events over SSE — replaces slow polling on the board.
 *
 * Watches the mtimes of the swarm state files once a second and pushes a
 * `data: {"changed":[...]}` event whenever any of them move. The client
 * invalidates the matching react-query caches, so the board updates within
 * ~1s of any state change instead of the old 30s poll.
 */
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { SWARM_CANONICAL_REPO } from '../../server/swarm-environment'

type WatchTarget = { kind: string; path: string }

function watchTargets(): Array<WatchTarget> {
  const rt = join(SWARM_CANONICAL_REPO, '.runtime')
  const targets: Array<WatchTarget> = [
    { kind: 'queue', path: join(rt, 'swarm-queue.json') },
    { kind: 'goals', path: join(rt, 'swarm-goals.json') },
    { kind: 'pipelines', path: join(rt, 'swarm-pipelines.json') },
    { kind: 'missions', path: join(rt, 'swarm-missions.json') },
    { kind: 'outcomes', path: join(rt, 'swarm-outcomes.jsonl') },
  ]
  try {
    const profiles = join(homedir(), '.hermes', 'profiles')
    for (const id of readdirSync(profiles)) {
      targets.push({
        kind: 'runtime',
        path: join(profiles, id, 'runtime.json'),
      })
    }
  } catch {
    /* no profiles dir */
  }
  return targets
}

function snapshot(targets: Array<WatchTarget>): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of targets) {
    try {
      m.set(t.path, statSync(t.path).mtimeMs)
    } catch {
      m.set(t.path, 0)
    }
  }
  return m
}

export const Route = createFileRoute('/api/swarm-events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return new Response('Unauthorized', { status: 401 })
        }
        const encoder = new TextEncoder()
        let timer: ReturnType<typeof setInterval> | null = null
        const stream = new ReadableStream({
          start(controller) {
            let targets = watchTargets()
            let last = snapshot(targets)
            let ticks = 0
            controller.enqueue(encoder.encode(': connected\n\n'))
            timer = setInterval(() => {
              try {
                ticks += 1
                // Re-discover profile dirs occasionally (new workers/clones).
                if (ticks % 30 === 0) targets = watchTargets()
                const now = snapshot(targets)
                const changed = new Set<string>()
                for (const t of targets) {
                  if (now.get(t.path) !== last.get(t.path)) changed.add(t.kind)
                }
                last = now
                if (changed.size > 0) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ changed: [...changed] })}\n\n`,
                    ),
                  )
                } else if (ticks % 25 === 0) {
                  controller.enqueue(encoder.encode(': keepalive\n\n'))
                }
              } catch {
                /* keep the stream alive */
              }
            }, 1000)
            // Hard cap: 15 min per connection; the client reconnects.
            setTimeout(
              () => {
                if (timer) clearInterval(timer)
                try {
                  controller.close()
                } catch {
                  /* already closed */
                }
              },
              15 * 60 * 1000,
            )
          },
          cancel() {
            if (timer) clearInterval(timer)
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
