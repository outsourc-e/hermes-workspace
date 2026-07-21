import type { WorkspacePacketMissionRailItem } from '../../../lib/workspace-kernel/mission-spine'
import './packet-handoff-rail.css'

export type PacketHandoffRailStatus = 'idle' | 'loading' | 'ready' | 'error'

export function PacketHandoffRail({
  items,
  status,
  runId,
  readback,
}: {
  items: Array<WorkspacePacketMissionRailItem>
  status: PacketHandoffRailStatus
  runId?: string
  readback?: string
}) {
  const emptyLabel = status === 'loading'
    ? 'Loading persisted Packets…'
    : status === 'error'
      ? 'Packet rail unavailable; no placeholder steps are shown.'
      : runId
        ? 'No persisted Packets for this run yet.'
        : 'Stage a mission before Packet handoffs can appear.'

  return (
    <section
      className="packet-handoff-rail"
      data-workspace-packet-rail="v1"
      data-packet-handoff-rail="v1"
      data-packet-handoff-status={status}
      data-packet-handoff-run-id={runId ?? ''}
      data-packet-handoff-count={items.length}
      data-packet-details-collapsed="true"
      aria-label="Persisted Packet mission rail"
    >
      <header className="packet-handoff-rail__head">
        <div>
          <span>Packet rail</span>
          <b>{items.length > 0 ? `${items.length} persisted handoff${items.length === 1 ? '' : 's'}` : 'Packet truth only'}</b>
        </div>
        <small>{readback ?? (runId ? `Run ${runId}` : 'Waiting for a persisted run')}</small>
      </header>

      {items.length === 0 ? (
        <p className={`packet-handoff-rail__empty is-${status}`}>{emptyLabel}</p>
      ) : (
        <div className="packet-handoff-rail__items">
          {items.map((item, index) => {
            const blocker = item.statusReason
              ?? (item.missingFields.length > 0 ? `Missing: ${item.missingFields.join(', ')}` : 'None')
            const approvalStatus = item.approvalGatePersisted
              ? 'persisted'
              : item.approvalStage
                ? 'required'
                : 'none'
            const owner = item.receiver.agentId ?? 'Room owner'
            const room = item.receiver.roomId
            return (
              <article
                key={item.packetId}
                className={`packet-handoff-rail__item is-${item.tone}`}
                data-packet-id={item.packetId}
                data-packet-type={item.packetType}
                data-packet-status={item.status}
                data-packet-step-status={item.status}
                data-packet-sender={item.sender.agentId ?? item.sender.roomId}
                data-packet-receiver={item.receiver.agentId ?? item.receiver.roomId}
                data-packet-missing-count={item.missingFields.length}
                data-packet-approval-status={approvalStatus}
              >
                <header className="packet-handoff-rail__summary">
                  <span className="packet-handoff-rail__route">
                    <b>Step {index + 1} · {item.packetType}</b>
                    <span>{item.summary}</span>
                  </span>
                  <em>{item.status}</em>
                </header>
                <div className="packet-handoff-rail__primary">
                  <span>
                    <small>Owner / room</small>
                    <b>{owner} · {room}</b>
                  </span>
                  <span>
                    <small>Blocker</small>
                    <b>{blocker}</b>
                  </span>
                  <span data-packet-approval-gate={approvalStatus}>
                    <small>Approval</small>
                    <b>{approvalStatus === 'persisted' ? `Persisted · ${item.approvalStage ?? 'required'}` : approvalStatus === 'required' ? `Required · ${item.approvalStage}` : 'Not required'}</b>
                  </span>
                  <span>
                    <small>Next required action</small>
                    <b>{item.nextRequiredAction}</b>
                  </span>
                </div>
                <details className="packet-handoff-rail__technical" data-packet-technical-details="collapsed">
                  <summary>Technical details</summary>
                  <code title={item.contentHash}>Packet {item.packetId} · hash {item.contentHash} · run {item.runId}</code>
                </details>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
