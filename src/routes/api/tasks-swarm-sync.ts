/**
 * Tasks ↔ Swarm Sync.
 *
 * Endpoints para two-way sync entre o Tasks board e missões swarm ativas.
 *
 * GET  /api/tasks-swarm-sync  → lista tasks com session_id (missões ativas)
 *   e mostra o estado da missão correspondente (running / complete / stale).
 *
 * POST /api/tasks-swarm-sync  → recebe um lote de actualizações de missões
 *   (complete / cancelled / failed) e atualiza as tasks do board em batch,
 *   libertando tasks stuck em in_progress quando a missão correspondente
 *   terminou sem checkpoint válido.
 */

import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { listTasks, updateTask, type TaskColumn } from '../../server/tasks-store'
import { readStore, type SwarmMission } from '../../server/swarm-missions'
import { SWARM_WORKER_BY_ASSIGNEE } from '../../lib/tasks-api'
import type { SwarmMissionAssignment } from '../../server/swarm-missions'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function findMission(store: { missions: SwarmMission[] }, id: string | null | undefined) {
  if (!id) return undefined
  return store.missions.find((m) => m.id === id)
}

function missionState(m: SwarmMission | undefined): 'active' | 'done' | 'cancelled' | 'unknown' {
  if (!m) return 'unknown'
  if (m.state === 'complete') return 'done'
  if (m.state === 'cancelled') return 'cancelled'
  return 'active'
}

export const Route = createFileRoute('/api/tasks-swarm-sync')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const all = listTasks({ includeDone: true })
        const store = readStore()

        const synced = all
          .filter((t) => t.session_id)
          .map((t) => {
            const mission = findMission(store, t.session_id)
            return {
              taskId: t.id,
              title: t.title,
              column: t.column,
              assignee: t.assignee,
              session_id: t.session_id,
              missionState: missionState(mission),
              missionAssignee: mission?.assignments[0]?.workerId ?? null,
            }
          })

        const byState = { active: 0, done: 0, cancelled: 0, unknown: 0 }
        for (const s of synced) byState[s.missionState]++

        return jsonResponse({
          synced: synced.length,
          byState,
          tasks: synced,
        })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const body = (await request.json().catch(() => ({}))) as {
          updates?: Array<{ missionId: string; state: string; taskId?: string }>
        }
        const updates = body.updates ?? []

        if (!Array.isArray(updates) || updates.length === 0) {
          return jsonResponse({ ok: true, applied: 0, message: 'no updates' })
        }

        const store = readStore()
        let applied = 0

        for (const u of updates) {
          if (!u.missionId || !u.state) continue

          const mission = findMission(store, u.missionId)
          if (!mission) continue

          // Find the task linked to this mission.
          const linkedTask = listTasks({ includeDone: true }).find(
            (t) => t.session_id === u.missionId,
          )
          if (!linkedTask) continue

          // Map mission state to task column.
          let newColumn: TaskColumn = linkedTask.column
          if (u.state === 'complete' || u.state === 'done') {
            newColumn = 'done'
          } else if (u.state === 'cancelled' || u.state === 'failed') {
            // Only move to done if it was in_progress (avoids clobbering
            // tasks that the user manually moved to review or backlog).
            if (linkedTask.column === 'in_progress') {
              newColumn = 'done'
            }
          }

          if (newColumn !== linkedTask.column) {
            updateTask(linkedTask.id, { column: newColumn })
            applied++
          }
        }

        return jsonResponse({ ok: true, applied, processed: updates.length })
      },
    },
  },
})
