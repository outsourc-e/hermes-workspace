import type {
  LivingV3AgentId,
  LivingV3RoomId,
  LivingV3StationId,
} from '../../../lib/war-room/living-v3/living-v3-contract'
import './workspace-station-cta.css'

export type WorkspaceStationCtaStatus = 'ready' | 'locked' | 'needs-approval' | 'running' | 'done' | 'blocked'

export type WorkspaceStationCtaMotionSignal =
  | 'standby'
  | 'walk-to-room'
  | 'work-at-tool'
  | 'blocked-at-gate'
  | 'return-with-readback'

export type WorkspaceStationCtaSecondaryAction = {
  id: string
  label: string
  onClick?: () => void
  disabled?: boolean
}

export type WorkspaceStationCtaProps = {
  actionId: string
  label: string
  sublabel: string
  status: WorkspaceStationCtaStatus
  ownerAgentId: LivingV3AgentId
  ownerLabel: string
  targetRoomId: LivingV3RoomId
  targetStationId?: LivingV3StationId
  targetToolLabel: string
  motionSignal: WorkspaceStationCtaMotionSignal
  position?: 'standard-header-right' | 'standard-dock-right'
  onPrimaryAction?: () => void
  disabled?: boolean
  secondaryActions?: Array<WorkspaceStationCtaSecondaryAction>
  /** Kept as contract input, intentionally not rendered in the primary UI. */
  proofSummary?: string
  /** Kept as contract input, intentionally not rendered in the primary UI. */
  proofItems?: Array<string>
  className?: string
}

function statusLabel(status: WorkspaceStationCtaStatus) {
  if (status === 'needs-approval') return 'Needs approval'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function WorkspaceStationCta({
  actionId,
  label,
  sublabel,
  status,
  ownerAgentId,
  ownerLabel,
  targetRoomId,
  targetStationId,
  targetToolLabel,
  motionSignal,
  position = 'standard-header-right',
  onPrimaryAction,
  disabled,
  secondaryActions = [],
  className = '',
}: WorkspaceStationCtaProps) {
  const primaryDisabled = disabled || !onPrimaryAction || status === 'locked' || status === 'blocked' || status === 'running'
  const visibleSecondary = secondaryActions
    .filter((action) => !/debug|demo|loki|scout\s*v?2|packet/i.test(action.label))
    .slice(0, 2)
  const hiddenDebugSecondaryCount = secondaryActions.length - visibleSecondary.length
  const readableLabel = `${label}. ${sublabel}. ${ownerLabel} to ${targetToolLabel}. ${statusLabel(status)}.`

  return (
    <section
      className={`workspace-station-cta workspace-station-cta--${position} ${className}`.trim()}
      data-workspace-station-cta="compact-v2"
      data-workspace-station-cta-heavy-card="removed"
      data-primary-action-id={actionId}
      data-primary-action-owner={ownerAgentId}
      data-primary-action-status={status}
      data-primary-action-position={position}
      data-proof-collapsed="removed"
      data-action-owner-agent={ownerAgentId}
      data-action-target-room={targetRoomId}
      data-action-target-station={targetStationId ?? ''}
      data-action-target-tool={targetToolLabel}
      data-action-motion-signal={motionSignal}
      data-hidden-debug-secondary-count={hiddenDebugSecondaryCount}
      aria-label={readableLabel}
      title={readableLabel}
    >
      <button
        type="button"
        className="workspace-station-cta__primary"
        onClick={onPrimaryAction}
        disabled={primaryDisabled}
        data-status={status}
      >
        <span className="workspace-station-cta__dot" aria-hidden="true" />
        <strong>{label}</strong>
        <small>{targetToolLabel}</small>
      </button>

      {visibleSecondary.length > 0 && (
        <div className="workspace-station-cta__secondary" aria-label="Secondary actions">
          {visibleSecondary.map((action) => (
            <button key={action.id} type="button" onClick={action.onClick} disabled={action.disabled || !action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
