import type {
  CSSProperties,
  FormEventHandler,
  PointerEventHandler,
} from 'react'

import type {
  LivingV3AgentDefinition,
  LivingV3StationId,
} from '../../../lib/war-room/living-v3/living-v3-contract'
import type { LivingV3AgentSnapshot } from '../../../lib/war-room/living-v3/living-v3-runtime'
import './agent-workbench-panel.css'

export type AgentWorkbenchMessage = {
  id: string
  from: 'operator' | 'agent' | 'receipt'
  text: string
}

type AgentWorkbenchStation = {
  id: LivingV3StationId
  label: string
}

type AgentWorkbenchPanelProps = {
  agent: LivingV3AgentDefinition
  snapshot: LivingV3AgentSnapshot
  roomLabel: string
  windowSizeLabel: string
  messages: Array<AgentWorkbenchMessage>
  draft: string
  stations: Array<AgentWorkbenchStation>
  onDraftChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onAssignStation: (stationId: LivingV3StationId) => void
  onRest: () => void
  onFitWindow: () => void
  onResetWindow: () => void
  onClose: () => void
  onBeginMove: PointerEventHandler<HTMLDivElement>
  onBeginResize: PointerEventHandler<HTMLSpanElement>
}

const activityLabels: Record<LivingV3AgentSnapshot['activity'], string> = {
  idle: 'Ready',
  walking: 'Moving',
  working: 'Working',
  talking: 'Talking',
  carrying: 'Carrying packet',
  'waiting-approval': 'Waiting for approval',
  sleeping: 'Resting',
}

function messageDirection(text: string): 'rtl' | 'ltr' {
  return /[\u0590-\u05ff\u0600-\u06ff]/.test(text) ? 'rtl' : 'ltr'
}

function messageLabel(from: AgentWorkbenchMessage['from']) {
  if (from === 'operator') return 'DLV'
  if (from === 'receipt') return 'Readback'
  return 'Agent'
}

function visualLabel(agent: LivingV3AgentDefinition) {
  if (agent.visualStatus === 'temporary-approved-sprite') return 'Temporary visual'
  if (agent.visualStatus === 'norse-operator-runtime-final') return 'Final Norse runtime'
  if (agent.visualStatus === 'terra-earth-pet-runtime-final') return 'Final Terra runtime'
  if (agent.visualStatus === 'poseidon-sea-pet-runtime-final') return 'Final Poseidon runtime'
  if (agent.visualStatus === 'council-room-general') return 'Council operator'
  if (agent.visualStatus === 'primary-roaming-companion') return 'Primary companion'
  if (agent.visualStatus === 'ambient-companion') return 'Ambient companion'
  return 'Approved room visual'
}

export function AgentWorkbenchPanel({
  agent,
  snapshot,
  roomLabel,
  windowSizeLabel,
  messages,
  draft,
  stations,
  onDraftChange,
  onSubmit,
  onAssignStation,
  onRest,
  onFitWindow,
  onResetWindow,
  onClose,
  onBeginMove,
  onBeginResize,
}: AgentWorkbenchPanelProps) {
  const packetLabel = snapshot.packetLabel?.trim() || 'No packet attached'
  const isWaiting = snapshot.activity === 'waiting-approval'

  return (
    <section
      className="agent-workbench"
      data-agent-workbench-panel="v2"
      data-agent-id={agent.id}
      data-agent-activity={snapshot.activity}
      style={{ '--agent-panel-accent': agent.accent } as CSSProperties}
      aria-label={`${agent.label} workbench`}
    >
      <div
        className="living-v3__agent-window-bar agent-workbench__dragbar"
        onPointerDown={onBeginMove}
      >
        <span>{agent.shortLabel}</span>
        <small>{windowSizeLabel} · drag to move</small>
      </div>

      <button className="living-v3__drawer-close agent-workbench__close" type="button" onClick={onClose} aria-label={`Close ${agent.label} workbench`}>
        ×
      </button>

      <header className="agent-workbench__identity">
        <div className="agent-workbench__portrait">
          <img src={agent.portraitPath} alt={`${agent.label} portrait`} />
          <span data-agent-presence={snapshot.activity} aria-hidden="true" />
        </div>
        <div className="agent-workbench__identity-copy">
          <p>{roomLabel} · {activityLabels[snapshot.activity]}</p>
          <h2>{agent.label}</h2>
          <span>{agent.role}</span>
        </div>
      </header>

      <div className="agent-workbench__status-strip" aria-label="Agent location and packet status">
        <span><small>Room</small><b>{roomLabel}</b></span>
        <span><small>Packet</small><b>{packetLabel}</b></span>
        <span data-agent-context-now={isWaiting ? 'approval' : snapshot.activity} role="status" aria-live="polite"><small>Now</small><b>{activityLabels[snapshot.activity]}</b></span>
      </div>

      <div className="agent-workbench__content-grid">
        <section className="agent-workbench__mission" aria-label="Current agent mission">
          <div className="agent-workbench__section-head">
            <div>
              <p>Current mission</p>
              <h3>{snapshot.label}</h3>
            </div>
            <span data-mission-state={isWaiting ? 'waiting-approval' : 'active'}>{isWaiting ? 'Approval needed' : 'Active'}</span>
          </div>

          <div className="agent-workbench__packet-card">
            <small>Active packet</small>
            <b>{packetLabel}</b>
            <p>{snapshot.navigation.segmentLabel || 'Agent is working inside the current room.'}</p>
          </div>

          <div className="agent-workbench__station-actions" aria-label="Send agent to a primary tool">
            <div>
              <p>Next action</p>
              <span>Send the agent to the recommended workbench, or choose another tool.</span>
            </div>
            {stations.length ? stations.map((station, index) => (
              <button key={station.id} className={index === 0 ? 'is-primary' : undefined} type="button" onClick={() => onAssignStation(station.id)}>
                <span>{station.label}</span>
                <small>{index === 0 ? 'Recommended · Open & work' : 'Open tool'}</small>
              </button>
            )) : <p className="agent-workbench__empty">No primary tool assigned.</p>}
          </div>
        </section>

        <section className="agent-workbench__conversation" aria-label={`Conversation with ${agent.label}`}>
          <div className="agent-workbench__section-head">
            <div>
              <p>Conversation</p>
              <h3>Ask, steer, or request readback</h3>
            </div>
            <span>{messages.length} visible</span>
          </div>

          <div className="living-v3__agent-chat agent-workbench__messages" aria-live="polite">
            {messages.length ? messages.map((message) => (
              <article
                key={message.id}
                className={`agent-workbench__message from-${message.from}`}
                data-agent-message-from={message.from}
                dir={messageDirection(message.text)}
              >
                <small>{messageLabel(message.from)}</small>
                <p>{message.text}</p>
              </article>
            )) : (
              <div className="agent-workbench__empty-message">
                <b>No messages yet</b>
                <span>Write a clear task below. The current packet and room stay visible beside the chat.</span>
              </div>
            )}
          </div>

          <form className="living-v3__chat-form agent-workbench__composer" onSubmit={onSubmit}>
            <label htmlFor={`agent-message-${agent.id}`}>Message {agent.label}</label>
            <input
              id={`agent-message-${agent.id}`}
              data-agent-message-input
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={`Message ${agent.shortLabel}`}
              dir="auto"
            />
            <button type="submit" disabled={!draft.trim()}>Ask</button>
          </form>
        </section>
      </div>

      <footer className="agent-workbench__footer">
        <button type="button" className="agent-workbench__rest" onClick={onRest}>Send to rest</button>
        <details data-agent-advanced-controls="collapsed">
          <summary>Agent details & window controls</summary>
          <div className="agent-workbench__advanced-grid">
            <article>
              <small>Persona</small>
              <p>{agent.persona}</p>
            </article>
            <article>
              <small>Visual</small>
              <p>{visualLabel(agent)}</p>
            </article>
            <div className="agent-workbench__window-actions">
              <button type="button" onClick={onFitWindow}>Fit wide</button>
              <button type="button" onClick={onResetWindow}>Reset window</button>
            </div>
          </div>
        </details>
      </footer>

      <span
        className="living-v3__agent-window-resize agent-workbench__resize"
        onPointerDown={onBeginResize}
        aria-hidden="true"
      />
    </section>
  )
}
