import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { deleteSession } from '../../server/claude-api'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationBinding,
} from '../../server/session-card-operation-binding'
import {
  cancelSwarmMission,
  swarmMissionHasExactCardAuthority,
} from '../../server/swarm-missions'
import { resetSwarmWorkerRuntime } from '../../server/swarm-runtime-reset'
import type { SessionCardOperationBinding } from '../../server/session-card-operation-binding'

function parseMissionIds(value: unknown): Array<string> | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const ids: Array<string> = []
  for (const candidate of value) {
    if (
      typeof candidate !== 'string' ||
      candidate.trim() !== candidate ||
      candidate.length === 0
    ) {
      return null
    }
    if (!ids.includes(candidate)) ids.push(candidate)
  }
  return ids
}

function parseCardBindings(
  value: unknown,
): Array<SessionCardOperationBinding> | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const bindings: Array<SessionCardOperationBinding> = []
  for (const candidate of value) {
    const record =
      candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : null
    const source = record?.canonicalSource
    const transport = record?.canonicalTransport
    if (
      (source !== 'local' && source !== 'remote') ||
      (source === 'local' && transport !== 'tmux') ||
      (source === 'remote' && transport !== 'gateway')
    ) {
      return null
    }
    const binding = parseSessionCardOperationBinding(candidate, {
      source,
      transport: source === 'local' ? 'tmux' : 'gateway',
    })
    if (!binding) return null
    if (!bindings.some((entry) => entry.cardId === binding.cardId)) {
      bindings.push(binding)
    }
  }
  return bindings
}

function missionAuthorityBinding(
  body: Record<string, unknown>,
  missionIds: ReadonlyArray<string>,
  bindings: ReadonlyArray<SessionCardOperationBinding>,
): SessionCardOperationBinding | null {
  if (missionIds.length === 0) return null
  if (
    typeof body.missionCardId !== 'string' ||
    body.missionCardId.trim() !== body.missionCardId
  ) {
    return null
  }
  return (
    bindings.find((binding) => binding.cardId === body.missionCardId) ?? null
  )
}

export const Route = createFileRoute('/api/conductor-stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => null)) as Record<
            string,
            unknown
          > | null
          // Raw gateway aliases are never an authorization boundary. Legacy or
          // injected sessionKeys requests must fail closed rather than no-op.
          if (
            !body ||
            Object.prototype.hasOwnProperty.call(body, 'sessionKeys')
          ) {
            return json(
              { ok: false, error: 'Invalid Session Card stop binding' },
              { status: 400 },
            )
          }
          const cardBindings = parseCardBindings(body.cardBindings)
          const missionIds = parseMissionIds(body.missionIds)
          if (!cardBindings || !missionIds) {
            return json(
              { ok: false, error: 'Invalid Session Card stop binding' },
              { status: 400 },
            )
          }
          const missionBinding = missionAuthorityBinding(
            body,
            missionIds,
            cardBindings,
          )
          if (missionIds.length > 0 && !missionBinding) {
            return json(
              { ok: false, error: 'Invalid Session Card stop binding' },
              { status: 400 },
            )
          }
          if (
            missionBinding &&
            missionIds.some(
              (missionId) =>
                !swarmMissionHasExactCardAuthority(missionId, missionBinding),
            )
          ) {
            return json(
              {
                ok: false,
                error: 'Session Card is not authorized for this mission',
              },
              { status: 409 },
            )
          }

          let deleted = 0
          let stoppedMissions = 0
          let cancelledNativeMissions = 0
          let staleAuthority = false
          const failures: Array<{
            operation: 'delete-session' | 'stop-mission' | 'reset-worker'
            id: string
            error: string
          }> = []
          const capabilities = await ensureGatewayProbed()
          for (const missionId of missionIds) {
            // Re-resolve after capability probing and immediately before the
            // destructive mission operation.
            if (
              !missionBinding ||
              !(await resolveExactSessionCardOperationBinding(missionBinding))
            ) {
              staleAuthority = true
              failures.push({
                operation: 'stop-mission',
                id: missionId,
                error: 'Session Card stop binding is unavailable',
              })
              continue
            }
            let nativeError: string | null = null
            try {
              const cancelled = cancelSwarmMission({
                missionId,
                actor: 'conductor-stop',
                reason: 'Conductor mission stopped by user',
              })
              if (cancelled) {
                cancelledNativeMissions += 1
                for (const workerId of Array.from(
                  new Set(
                    cancelled.mission.assignments.map(
                      (assignment) => assignment.workerId,
                    ),
                  ),
                )) {
                  const workerBinding = cardBindings.find(
                    (binding) =>
                      binding.canonicalSource === 'local' &&
                      binding.canonicalSegmentKey === `local:${workerId}`,
                  )
                  if (!workerBinding) {
                    staleAuthority = true
                    failures.push({
                      operation: 'reset-worker',
                      id: workerId,
                      error: 'Exact Session Card worker binding is required',
                    })
                    continue
                  }
                  // Native mission cancellation does not authorize a later
                  // worker runtime reset. Re-resolve each local worker Card
                  // independently at the file mutation edge.
                  if (
                    !(await resolveExactSessionCardOperationBinding(
                      workerBinding,
                    ))
                  ) {
                    staleAuthority = true
                    failures.push({
                      operation: 'reset-worker',
                      id: workerId,
                      error: 'Session Card worker binding is unavailable',
                    })
                    continue
                  }
                  if (
                    !swarmMissionHasExactCardAuthority(missionId, workerBinding)
                  ) {
                    staleAuthority = true
                    failures.push({
                      operation: 'reset-worker',
                      id: workerId,
                      error:
                        'Session Card worker is not authorized for this mission',
                    })
                    continue
                  }
                  try {
                    const reset = resetSwarmWorkerRuntime(workerId, {
                      actor: 'conductor-stop',
                      reason: `Cancelled native Conductor mission ${missionId}`,
                    })
                    if (!reset.ok) {
                      failures.push({
                        operation: 'reset-worker',
                        id: workerId,
                        error: `Unable to reset worker runtime${reset.error ? `: ${reset.error}` : ''}`,
                      })
                    }
                  } catch (error) {
                    failures.push({
                      operation: 'reset-worker',
                      id: workerId,
                      error: `Unable to reset worker runtime: ${
                        error instanceof Error ? error.message : String(error)
                      }`,
                    })
                  }
                }
                continue
              }
            } catch (error) {
              nativeError =
                error instanceof Error ? error.message : String(error)
            }

            if (capabilities.dashboard.available && capabilities.conductor) {
              try {
                const res = await dashboardFetch(
                  `/api/conductor/missions/${encodeURIComponent(missionId)}`,
                  { method: 'DELETE' },
                )
                if (res.ok) {
                  stoppedMissions += 1
                } else {
                  const detail = await res.text().catch(() => '')
                  failures.push({
                    operation: 'stop-mission',
                    id: missionId,
                    error: detail || `HTTP ${res.status}`,
                  })
                }
              } catch (error) {
                failures.push({
                  operation: 'stop-mission',
                  id: missionId,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            } else {
              failures.push({
                operation: 'stop-mission',
                id: missionId,
                error:
                  nativeError ||
                  'Conductor mission stop capability unavailable',
              })
            }
          }

          for (const binding of cardBindings.filter(
            (candidate) => candidate.canonicalSource === 'remote',
          )) {
            // There is no await between this exact fresh resolution and invoking
            // deletion with the canonical segment it authorized.
            const owner = await resolveExactSessionCardOperationBinding(binding)
            if (!owner) {
              staleAuthority = true
              failures.push({
                operation: 'delete-session',
                id: binding.cardId,
                error: 'Session Card stop binding is unavailable',
              })
              continue
            }
            if (
              missionIds.length > 0 &&
              !missionIds.some((missionId) =>
                swarmMissionHasExactCardAuthority(missionId, binding),
              )
            ) {
              staleAuthority = true
              failures.push({
                operation: 'delete-session',
                id: binding.cardId,
                error: 'Session Card worker is not authorized for this mission',
              })
              continue
            }
            const sessionKey = binding.canonicalSegmentKey.slice(
              'remote:'.length,
            )
            try {
              await deleteSession(sessionKey)
              deleted += 1
            } catch {
              failures.push({
                operation: 'delete-session',
                id: owner.cardId,
                error: 'Unable to delete Session Card runtime',
              })
            }
          }

          return json(
            {
              ok: failures.length === 0,
              deleted,
              stoppedMissions,
              cancelledNativeMissions,
              failures,
            },
            {
              status: failures.length === 0 ? 200 : staleAuthority ? 409 : 502,
            },
          )
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
