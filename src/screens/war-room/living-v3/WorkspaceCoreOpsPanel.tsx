import { useEffect, useMemo, useState } from 'react'
import { livingV3RoomById } from '../../../lib/war-room/living-v3/living-v3-contract'
import type { CSSProperties, MouseEvent } from 'react'
import type { WorkspaceCoreOpsNotification, WorkspaceCoreOpsSnapshot } from '../../../lib/workspace-core-ops'
import type { LivingV3RoomId } from '../../../lib/war-room/living-v3/living-v3-contract'
import './workspace-core-ops-panel.css'

const DISMISSED_NOTIFICATIONS_STORAGE_KEY = 'hermes:workspace-core-ops:dismissed-notifications:v1'
const DRAWER_OPEN_STORAGE_KEY = 'hermes:workspace-core-ops:drawer-open:v2'

export type WorkspaceCoreOpsApprovalDecision = 'approved' | 'rejected'

export type WorkspaceCoreOpsPersistenceView = {
  provider?: 'supabase' | 'local-file'
  status?: 'connected' | 'fallback' | 'error'
  liveSource?: boolean
  writebackAllowed?: boolean
  readback?: string
  runCount?: number
  approvalCount?: number
}

function notificationAvatarStyle(notification: WorkspaceCoreOpsNotification): CSSProperties {
  return {
    '--ops-agent-accent': notification.actorAccent,
    backgroundImage: `linear-gradient(160deg, rgba(6, 18, 26, 0.15), rgba(6, 18, 26, 0.78)), url(${notification.actorPortraitPath})`,
  } as CSSProperties
}

function loadDismissedNotificationIds(): Array<string> {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_NOTIFICATIONS_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(-160) : []
  } catch {
    return []
  }
}

function loadDrawerOpenPreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(DRAWER_OPEN_STORAGE_KEY, '0')
  } catch {
    // Browser-only preference. The drawer must still default closed over active workspaces.
  }
  return false
}

function isActionableNotification(notification: WorkspaceCoreOpsNotification) {
  return notification.source === 'approval' && Boolean(notification.approvalId)
}

export function WorkspaceCoreOpsPanel({
  snapshot,
  storeStatus,
  persistence,
  onOpenRoom,
  onApprovalDecision,
}: {
  snapshot: WorkspaceCoreOpsSnapshot
  storeStatus: string
  persistence?: WorkspaceCoreOpsPersistenceView | null
  onOpenRoom: (roomId: LivingV3RoomId) => void
  onApprovalDecision?: (notification: WorkspaceCoreOpsNotification, decision: WorkspaceCoreOpsApprovalDecision) => void
}) {
  const [drawerOpen, setDrawerOpen] = useState(loadDrawerOpenPreference)
  const [dismissedIds, setDismissedIds] = useState<Array<string>>(loadDismissedNotificationIds)
  const dismissedSet = useMemo(() => new Set(dismissedIds), [dismissedIds])
  const visibleNotifications = useMemo(() => snapshot.notifications.filter((notification) => !dismissedSet.has(notification.notificationId)), [dismissedSet, snapshot.notifications])
  const actionableNotifications = useMemo(() => visibleNotifications.filter(isActionableNotification), [visibleNotifications])
  const topNotifications = actionableNotifications.slice(0, 6)
  const actionableCount = actionableNotifications.length
  const suppressedNotificationCount = Math.max(0, visibleNotifications.length - actionableNotifications.length)
  const topApproval = snapshot.approvals.find((approval) => approval.status === 'waiting_operator' || approval.status === 'needs_edit')
  const latestArtifact = snapshot.artifacts.at(0)
  const badgeCount = Math.min(99, actionableCount)

  useEffect(() => {
    try {
      window.localStorage.setItem(DISMISSED_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(dismissedIds.slice(-160)))
    } catch {
      // Browser-only preference. Notifications still render if storage is unavailable.
    }
  }, [dismissedIds])

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAWER_OPEN_STORAGE_KEY, drawerOpen ? '1' : '0')
    } catch {
      // Browser-only preference.
    }
  }, [drawerOpen])

  function dismissNotification(notificationId: string, event?: MouseEvent) {
    event?.preventDefault()
    event?.stopPropagation()
    setDismissedIds((current) => current.includes(notificationId) ? current : [...current, notificationId].slice(-160))
  }

  function decideApproval(notification: WorkspaceCoreOpsNotification, decision: WorkspaceCoreOpsApprovalDecision, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    onApprovalDecision?.(notification, decision)
    dismissNotification(notification.notificationId)
  }

  return (
    <div
      className={`workspace-core-ops-shell ${drawerOpen ? 'is-open' : 'is-collapsed'}`}
      data-workspace-core-ops-shell="notification-drawer-v1"
      data-notification-drawer-default="collapsed-v2"
      data-notification-drawer-open={drawerOpen ? 'true' : 'false'}
      data-notification-count={actionableCount}
      data-actionable-count={actionableCount}
      data-debug-notification-count={suppressedNotificationCount}
    >
      <button
        type="button"
        className="workspace-core-ops-bell"
        onClick={() => setDrawerOpen((open) => !open)}
        aria-expanded={drawerOpen}
        aria-controls="workspace-core-ops-drawer"
        aria-label={`${drawerOpen ? 'Close' : 'Open'} workspace notifications`}
        title={`${actionableCount} approval notification${actionableCount === 1 ? '' : 's'}`}
      >
        <span aria-hidden="true">🔔</span>
        <b>{badgeCount}</b>
      </button>

      <aside
        id="workspace-core-ops-drawer"
        className="workspace-core-ops-panel"
        data-workspace-core-ops="v1"
        data-human-alert-cards="agent-summary-v3"
        data-notification-drawer="right-toggle-v1"
        data-read-only-api={persistence?.provider === 'supabase' ? 'false' : 'true'}
        data-db-provider={persistence?.provider ?? 'local-file'}
        data-db-writeback-allowed={persistence?.writebackAllowed ? 'true' : 'false'}
        data-live-actions-locked="true"
        aria-label="Workspace notifications"
        aria-hidden={drawerOpen ? undefined : true}
      >
        <header className="workspace-core-ops-panel__header">
          <div>
            <span>Approvals</span>
            <strong>Only items needing your decision</strong>
          </div>
          <small title={persistence?.readback ?? 'Workspace database status'}>{storeStatus}</small>
        </header>

        <div className="workspace-core-ops-panel__metrics" aria-label="Workspace operations counters">
          <article>
            <span>Needs decision</span>
            <strong>{actionableCount}</strong>
          </article>
          <article>
            <span>Need OK</span>
            <strong>{snapshot.counts.waitingApprovals}</strong>
          </article>
          <article>
            <span>Ready</span>
            <strong>{snapshot.counts.artifacts}</strong>
          </article>
        </div>

        <div className="workspace-core-ops-panel__safety" aria-label="Workspace safety locks">
          <span>{persistence?.provider === 'supabase' && persistence.status === 'connected' ? 'DB logged' : 'Local mirror'}</span>
          <span>No live sends</span>
          <span>Executors locked</span>
        </div>

        <div className="workspace-core-ops-panel__body">
          <section>
            <div className="workspace-core-ops-panel__section-title">
              <span>Latest</span>
              <b>{actionableCount > 0 ? `${actionableCount} need your OK` : 'nothing waiting'}</b>
            </div>
            {topNotifications.length === 0 ? (
              <p className="workspace-core-ops-panel__empty">No approvals need a decision.</p>
            ) : (
              <ul className="workspace-core-ops-panel__notification-list">
                {topNotifications.map((notification) => {
                  const roomLabel = livingV3RoomById(notification.roomId)?.label ?? notification.roomId
                  const actionable = isActionableNotification(notification)
                  return (
                    <li key={notification.notificationId} data-severity={notification.severity} data-actionable={actionable ? 'true' : 'false'}>
                      <article className="workspace-core-ops-panel__notification-card">
                        <button
                          className="workspace-core-ops-panel__notification-main"
                          type="button"
                          onClick={() => onOpenRoom(notification.roomId)}
                          title={`Open ${roomLabel}`}
                        >
                          <span
                            className="workspace-core-ops-panel__notification-avatar"
                            data-agent-id={notification.actorAgentId}
                            style={notificationAvatarStyle(notification)}
                            aria-hidden="true"
                          >
                            <span>{notification.actorShortLabel}</span>
                          </span>
                          <span className="workspace-core-ops-panel__notification-copy">
                            <b>{notification.title}</b>
                            <span>{notification.summary}</span>
                            <em>{notification.actorLabel} · {roomLabel}</em>
                          </span>
                        </button>
                        <div className="workspace-core-ops-panel__notification-controls">
                          {actionable && (
                            <>
                              <button type="button" className="is-approve" onClick={(event) => decideApproval(notification, 'approved', event)}>OK</button>
                              <button type="button" className="is-reject" onClick={(event) => decideApproval(notification, 'rejected', event)}>Cancel</button>
                            </>
                          )}
                          <button type="button" className="is-dismiss" onClick={(event) => dismissNotification(notification.notificationId, event)} aria-label="Dismiss notification">×</button>
                        </div>
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {suppressedNotificationCount > 0 && (
            <details className="workspace-core-ops-panel__debug-log" data-ops-debug-log="collapsed-v1">
              <summary>{suppressedNotificationCount} run/readback logs hidden</summary>
              <p>System run history stays out of the main UI. Open only for debugging stale runs or persistence readback.</p>
            </details>
          )}

          <section className="workspace-core-ops-panel__handoff">
            <div>
              <span>Next approval</span>
              <strong>{topApproval?.requestedAction ?? 'None waiting'}</strong>
            </div>
            <div>
              <span>Latest packet</span>
              <strong>{latestArtifact?.label ?? 'None yet'}</strong>
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}
