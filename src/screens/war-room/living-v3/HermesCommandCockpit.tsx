import { useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export type HermesCommandRunStatus = 'idle' | 'running' | 'waiting_operator' | 'completed' | 'blocked' | 'failed'
export type HermesCommandSurfaceMode = 'command' | 'mission-control'

export type HermesCommandActionRunCard = {
  runId: string
  status: HermesCommandRunStatus
  prompt: string
  intent: string
  capability: string
  assignedAgentId: string
  targetRoomId?: string
  targetStationId?: string
  toolId?: string
  readback: string
  visualNextStep: string
  missingCapabilityTitle?: string
  buildPlan?: Array<string>
  createdAtMs: number
  updatedAtMs: number
}

export type HermesCommandMessage = {
  id: string
  from: 'operator' | 'agent' | 'receipt'
  text: string
}

export type HermesCommandAgentStatusTone = 'idle' | 'active' | 'moving' | 'approval' | 'resting' | 'visual'

export type HermesCommandAgentSummary = {
  id: string
  label: string
  shortLabel: string
  portraitPath: string
  roomLabel: string
  activityLabel: string
  statusTone: HermesCommandAgentStatusTone
  lastMessage?: string
}

export type HermesCommandTaskStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'blocked' | 'failed'

export type HermesCommandTaskSummary = {
  id: string
  title: string
  status: HermesCommandTaskStatus
  roomLabel: string
  agentLabel: string
  readback: string
  updatedAtMs: number
}

function compactCopy(value: string, max = 220) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function runGlyph(status: HermesCommandRunStatus) {
  if (status === 'running') return '•••'
  if (status === 'waiting_operator') return '?'
  if (status === 'completed') return '✓'
  if (status === 'blocked') return '!'
  if (status === 'failed') return '×'
  return '·'
}

function runTitle(status: HermesCommandRunStatus) {
  if (status === 'running') return 'Hermes עובד'
  if (status === 'waiting_operator') return 'החלטה שלך'
  if (status === 'completed') return 'מוכן'
  if (status === 'blocked') return 'צריך יכולת'
  if (status === 'failed') return 'לא הושלם'
  return 'מוכן למשימה'
}

function taskStatusLabel(status: HermesCommandTaskStatus) {
  if (status === 'running') return 'עובד'
  if (status === 'waiting') return 'מחכה לך'
  if (status === 'completed') return 'הושלם'
  if (status === 'blocked') return 'נעצר'
  if (status === 'failed') return 'נכשל'
  return 'בתור'
}

function agentStatusLabel(status: HermesCommandAgentStatusTone) {
  if (status === 'active') return 'עובד'
  if (status === 'moving') return 'בדרך'
  if (status === 'approval') return 'מחכה לך'
  if (status === 'resting') return 'נח'
  if (status === 'visual') return 'נוכחות'
  return 'פנוי'
}

function targetLabel(actionRun: HermesCommandActionRunCard) {
  if (actionRun.intent === 'council_consultation_offer') return 'המועצה'
  if (actionRun.assignedAgentId !== 'hermes') return actionRun.assignedAgentId
  if (actionRun.targetStationId) return actionRun.targetStationId.replaceAll('-', ' ')
  return 'Hermes'
}

function taskTime(updatedAtMs: number) {
  if (!updatedAtMs) return ''
  return new Date(updatedAtMs).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export function HermesCommandCockpit({
  surfaceMode = 'command',
  prompt,
  onPromptChange,
  onRun,
  runDisabled,
  actionRun,
  focusTitle,
  focusBody,
  sourceDetails,
  conversation = [],
  onApproveCouncil,
  onSkipCouncil,
  sideStack,
  agents = [],
  tasks = [],
  activeAgentId,
  onSelectAgent,
  onOpenHermesCommand,
  onOpenMissionControl,
}: {
  surfaceMode?: HermesCommandSurfaceMode
  prompt: string
  onPromptChange: (value: string) => void
  onRun: () => void
  runDisabled: boolean
  actionRun: HermesCommandActionRunCard
  focusTitle: string
  focusBody: string
  sourceDetails: ReactNode
  conversation?: Array<HermesCommandMessage>
  onApproveCouncil?: () => void
  onSkipCouncil?: () => void
  sideStack?: ReactNode
  agents?: Array<HermesCommandAgentSummary>
  tasks?: Array<HermesCommandTaskSummary>
  activeAgentId?: string
  onSelectAgent?: (agentId: string) => void
  onOpenHermesCommand?: (taskId?: string) => void
  onOpenMissionControl?: () => void
}) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const promptReady = prompt.trim().length > 0
  const runVisible = actionRun.status !== 'idle'
  const councilDecision = actionRun.intent === 'council_consultation_offer' && actionRun.status === 'waiting_operator'
  const visibleMessages = conversation.slice(-8)
  const hasConversation = visibleMessages.length > 0
  const focusText = actionRun.readback || focusBody
  const focusIsLong = focusText.replace(/\s+/g, ' ').trim().length > 220
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const missionDefaultTask = tasks.find((task) => task.status === 'waiting')
    ?? tasks.find((task) => task.status === 'running')
    ?? tasks[0]
  const focusedTask = selectedTaskId === '__current__'
    ? undefined
    : selectedTask ?? (surfaceMode === 'mission-control' ? missionDefaultTask : undefined)
  const latestOperatorMessage = [...visibleMessages].reverse().find((message) => message.from === 'operator')
  const currentThreadTitle = compactCopy(latestOperatorMessage?.text || prompt || 'שיחה חדשה', 42)
  const workingAgentCount = agents.filter((agent) => agent.statusTone === 'active' || agent.statusTone === 'moving' || agent.statusTone === 'approval').length
  const approvalTasks = tasks.filter((task) => task.status === 'waiting')
  const activeTasks = tasks.filter((task) => task.status === 'running' || task.status === 'queued')
  const completedTasks = tasks.filter((task) => task.status === 'completed')
  const approvalCount = approvalTasks.length + (councilDecision ? 1 : 0)
  const isMissionControl = surfaceMode === 'mission-control'

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || runDisabled || !promptReady) return
    event.preventDefault()
    onRun()
  }

  function renderTaskFocus(task: HermesCommandTaskSummary, missionControl = false) {
    return (
      <article className={`hermes-command-cockpit__task-focus is-${task.status}`} data-command-task-focus={task.id}>
        <div className="hermes-command-cockpit__eyebrow">
          <span>{taskStatusLabel(task.status)}</span>
          <small>{task.agentLabel}</small>
        </div>
        <h3 dir="auto">{task.title}</h3>
        <p dir="auto">{task.readback || 'אין עדיין תוצר לקריאה.'}</p>
        <dl>
          <div><dt>חדר</dt><dd>{task.roomLabel}</dd></div>
          <div><dt>עודכן</dt><dd>{taskTime(task.updatedAtMs)}</dd></div>
        </dl>
        {missionControl ? (
          <button
            type="button"
            className="hermes-command-cockpit__primary"
            data-talk-about-task={task.id}
            onClick={() => onOpenHermesCommand?.(task.id)}
          >
            דבר עם Hermes על המשימה
          </button>
        ) : (
          <button type="button" className="hermes-command-cockpit__secondary" onClick={() => setSelectedTaskId('__current__')}>
            חזרה לתוצר הנוכחי
          </button>
        )}
      </article>
    )
  }

  function renderCurrentResult() {
    if (!runVisible) {
      return (
        <div className="hermes-command-cockpit__workbench-empty">
          <span aria-hidden="true">↗</span>
          <h3>{isMissionControl ? 'בחר משימה לניהול' : 'התוצר יופיע כאן'}</h3>
          <p>{compactCopy(focusBody || (isMissionControl
            ? 'משימות, אישורים ו-Readbacks יופיעו כאן לפי הבחירה שלך.'
            : 'שלח בקשה כדי לקבל ניתוב, תוצר והצעד הבא.'), 170)}</p>
          <div>
            <b>קלט</b>
            <i />
            <b>עבודה</b>
            <i />
            <b>תוצאה</b>
          </div>
        </div>
      )
    }

    return (
      <article
        className={`hermes-command-cockpit__result hermes-command-cockpit__result--${actionRun.status}`}
        data-action-run-status={actionRun.status}
      >
        <div className="hermes-command-cockpit__result-head">
          <div className="hermes-command-cockpit__result-mark" aria-hidden="true">{runGlyph(actionRun.status)}</div>
          <div>
            <span>{runTitle(actionRun.status)}</span>
            <h3>{councilDecision ? 'להתייעץ עם המועצה?' : compactCopy(focusTitle, 64)}</h3>
          </div>
        </div>
        <span className="hermes-command-cockpit__target">יעד · {targetLabel(actionRun)}</span>
        <p className="hermes-command-cockpit__readback">{compactCopy(focusText, 300)}</p>

        {councilDecision ? (
          <div className="hermes-command-cockpit__decision" aria-label="אישור התייעצות עם המועצה">
            <p>Hermes ממליץ להרחיב את הדיון. המועצה תתחיל רק אחרי הבחירה שלך.</p>
            <div>
              <button type="button" className="hermes-command-cockpit__primary" onClick={onApproveCouncil}>התייעץ</button>
              <button type="button" className="hermes-command-cockpit__secondary" onClick={onSkipCouncil}>לא עכשיו</button>
            </div>
          </div>
        ) : (
          <div className="hermes-command-cockpit__next">
            <span>הבא</span>
            <p>{compactCopy(actionRun.visualNextStep, 180)}</p>
          </div>
        )}

        <details className="hermes-command-cockpit__details">
          <summary>פרטים</summary>
          <div>
            <dl>
              <div><dt>Run</dt><dd>{actionRun.runId}</dd></div>
              <div><dt>ניתוב</dt><dd>{actionRun.intent} → {targetLabel(actionRun)}</dd></div>
              <div><dt>כלי</dt><dd>{actionRun.toolId ?? 'ללא כלי'}</dd></div>
              <div><dt>יכולת</dt><dd>{actionRun.capability}</dd></div>
            </dl>
            {focusIsLong && <p>{focusText}</p>}
            {actionRun.missingCapabilityTitle && <p>{actionRun.missingCapabilityTitle}</p>}
            {actionRun.buildPlan?.length ? (
              <ol>{actionRun.buildPlan.map((step) => <li key={step}>{step}</li>)}</ol>
            ) : null}
            {sourceDetails ? <div className="hermes-command-cockpit__source-details">{sourceDetails}</div> : null}
          </div>
        </details>
      </article>
    )
  }

  function renderWorkbench(missionControl = false) {
    return focusedTask ? renderTaskFocus(focusedTask, missionControl) : renderCurrentResult()
  }

  function renderTaskButtons(limit = 8) {
    if (tasks.length === 0) return <p className="hermes-command-cockpit__quiet-empty">אין משימות פעילות.</p>
    return tasks.slice(0, limit).map((task) => (
      <button
        key={task.id}
        type="button"
        className={`is-${task.status} ${focusedTask?.id === task.id ? 'is-selected' : ''}`}
        data-command-task={task.id}
        onClick={() => setSelectedTaskId(task.id)}
      >
        <div>
          <span className="hermes-command-cockpit__status-dot" aria-hidden="true" />
          <strong dir="auto">{compactCopy(task.title, 58)}</strong>
          <small>{task.agentLabel} · {task.roomLabel}</small>
        </div>
        <span>{taskStatusLabel(task.status)}</span>
      </button>
    ))
  }

  function renderAgentButtons() {
    if (agents.length === 0) return <p className="hermes-command-cockpit__quiet-empty">סטטוס הצוות עדיין לא נטען.</p>
    return agents.slice(0, 12).map((agent) => (
      <button
        key={agent.id}
        type="button"
        className={`is-${agent.statusTone} ${activeAgentId === agent.id ? 'is-selected' : ''}`}
        data-command-agent={agent.id}
        onClick={() => onSelectAgent?.(agent.id)}
      >
        <img src={agent.portraitPath} alt="" />
        <div>
          <strong>{agent.label}</strong>
          <small>{agent.roomLabel} · {agent.activityLabel}</small>
          {agent.lastMessage && <p dir="auto">{compactCopy(agent.lastMessage, 72)}</p>}
        </div>
        <span>{agentStatusLabel(agent.statusTone)}</span>
      </button>
    ))
  }

  return (
    <section
      className={`hermes-command-cockpit is-${surfaceMode}`}
      data-hermes-command-cockpit="command-bridge-v2"
      data-hermes-tool={surfaceMode === 'mission-control' ? 'mission-control' : 'hermes-command'}
      data-hermes-ui-contract={surfaceMode === 'mission-control' ? 'mission-control-v1' : 'hermes-command-v1'}
      dir="rtl"
      aria-label={isMissionControl ? 'Mission Control' : 'Hermes Command'}
    >
      <header className="hermes-command-cockpit__header">
        <div className="hermes-command-cockpit__identity">
          <div className="hermes-command-cockpit__portrait" aria-hidden="true">
            <img src="/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png" alt="" />
            <span>H</span>
          </div>
          <div>
            <h2>{isMissionControl ? 'Mission Control' : 'Hermes Command'}</h2>
            <p>{isMissionControl ? 'אתה מנהל · Hermes מתאם' : 'Hermes מנהל · אתה מחליט'}</p>
          </div>
        </div>

        <nav className="hermes-command-cockpit__tool-switch" aria-label="כלי חדר Hermes">
          <button
            type="button"
            className={!isMissionControl ? 'is-active' : ''}
            data-open-hermes-tool="hermes-command"
            aria-current={!isMissionControl ? 'page' : undefined}
            onClick={() => onOpenHermesCommand?.()}
          >
            Hermes Command
          </button>
          <button
            type="button"
            className={isMissionControl ? 'is-active' : ''}
            data-open-hermes-tool="mission-control"
            aria-current={isMissionControl ? 'page' : undefined}
            onClick={onOpenMissionControl}
          >
            Mission Control
          </button>
        </nav>

        <div className="hermes-command-cockpit__team-peek" aria-label={`${agents.length} אייג׳נטים בחדר הפיקוד`}>
          <span>{agents.length}</span>
          <div>
            {agents.slice(0, 4).map((agent) => (
              <img key={agent.id} src={agent.portraitPath} alt="" />
            ))}
          </div>
        </div>
      </header>

      {!isMissionControl ? (
        <div className="hermes-command-cockpit__bridge hermes-command-cockpit__bridge--command">
          <aside
            className="hermes-command-cockpit__threads"
            data-command-bridge-region="threads"
            aria-label="שיחות ומשימות אחרונות"
          >
            <div className="hermes-command-cockpit__panel-head">
              <strong>שיחות</strong>
              <span>{conversation.length}</span>
            </div>
            <div className="hermes-command-cockpit__thread-current">
              <span>עכשיו</span>
              <strong>{currentThreadTitle}</strong>
              <small>{runVisible ? runTitle(actionRun.status) : 'מוכן לבקשה'}</small>
            </div>
            <p className="hermes-command-cockpit__section-label">משימות אחרונות</p>
            <div className="hermes-command-cockpit__thread-list">
              {tasks.length === 0 ? (
                <p className="hermes-command-cockpit__quiet-empty">עוד אין משימות שמורות.</p>
              ) : tasks.slice(0, 6).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={focusedTask?.id === task.id ? 'is-selected' : ''}
                  data-command-thread={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <strong dir="auto">{compactCopy(task.title, 40)}</strong>
                  <small>{task.roomLabel}</small>
                  <span>{taskStatusLabel(task.status)} · {taskTime(task.updatedAtMs)}</span>
                </button>
              ))}
            </div>
          </aside>

          <main
            className="hermes-command-cockpit__chat"
            data-command-bridge-region="chat"
            aria-label="שיחה עם Hermes"
          >
            <div className="hermes-command-cockpit__chat-head">
              <div>
                <strong>שיחה עם Hermes</strong>
                <span>{currentThreadTitle}</span>
              </div>
              <small className={`is-${actionRun.status}`}>{runTitle(actionRun.status)}</small>
            </div>

            <div className="hermes-command-cockpit__conversation" aria-live="polite">
              {!hasConversation && !runVisible && (
                <div className="hermes-command-cockpit__empty">
                  <img src="/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png" alt="" />
                  <h3>מה תרצה להשיג?</h3>
                  <p>כתוב מטרה אחת. Hermes ינתב את העבודה ויחזיר תוצאה ברורה.</p>
                </div>
              )}

              {visibleMessages.map((message) => {
                const fullText = message.text.trim()
                const messageIsLong = fullText.replace(/\s+/g, ' ').length > 220
                return (
                  <article
                    key={message.id}
                    className={`hermes-command-cockpit__message hermes-command-cockpit__message--${message.from}`}
                    data-message-role={message.from}
                  >
                    <span>{message.from === 'operator' ? 'אתה' : message.from === 'receipt' ? 'תוצאה' : 'Hermes'}</span>
                    <p dir="auto">{compactCopy(fullText, 220)}</p>
                    {messageIsLong && (
                      <details>
                        <summary>הודעה מלאה</summary>
                        <p>{fullText}</p>
                      </details>
                    )}
                  </article>
                )
              })}

              {runVisible && (
                <article className={`hermes-command-cockpit__chat-receipt is-${actionRun.status}`}>
                  <span className="hermes-command-cockpit__receipt-mark" aria-hidden="true">{runGlyph(actionRun.status)}</span>
                  <div>
                    <small>{runTitle(actionRun.status)} · {targetLabel(actionRun)}</small>
                    <strong>{councilDecision ? 'נדרשת החלטה שלך ב-Workbench' : compactCopy(focusTitle, 64)}</strong>
                    <p>{compactCopy(focusText, 170)}</p>
                  </div>
                </article>
              )}
            </div>

            <form
              className="hermes-command-cockpit__composer"
              onSubmit={(event) => {
                event.preventDefault()
                if (!runDisabled && promptReady) onRun()
              }}
            >
              <textarea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="מה תרצה להשיג?"
                rows={2}
                aria-label="משימה ל-Hermes"
              />
              <div className="hermes-command-cockpit__composer-foot">
                <span>Enter לשליחה · Shift+Enter לשורה</span>
                <button
                  type="submit"
                  className="hermes-command-cockpit__send"
                  disabled={runDisabled || !promptReady}
                  aria-label={actionRun.status === 'running' ? 'Hermes עובד' : 'שלח ל-Hermes'}
                >
                  {actionRun.status === 'running' ? '•••' : 'שלח'}
                </button>
              </div>
            </form>
          </main>

          <section
            className="hermes-command-cockpit__workbench"
            data-command-bridge-region="workbench"
            aria-label="Workbench"
          >
            <div className="hermes-command-cockpit__panel-head">
              <strong>Workbench</strong>
              <span>{focusedTask ? 'משימה שמורה' : runVisible ? 'תוצר נוכחי' : 'ממתין'}</span>
            </div>
            <div className="hermes-command-cockpit__workbench-body">
              {renderWorkbench(false)}
            </div>
          </section>
        </div>
      ) : (
        <div className="hermes-command-cockpit__bridge hermes-command-cockpit__bridge--mission-control">
          <aside
            className="hermes-command-cockpit__mission-tasks"
            data-command-bridge-region="mission-tasks"
            aria-label="משימות ואישורים"
          >
            <div className="hermes-command-cockpit__panel-head">
              <strong>משימות</strong>
              <span>{tasks.length}</span>
            </div>
            <div className="hermes-command-cockpit__mission-summary" aria-label="סיכום תפעולי">
              <div><strong>{approvalCount}</strong><span>מחכות לך</span></div>
              <div><strong>{activeTasks.length}</strong><span>פעילות</span></div>
              <div><strong>{completedTasks.length}</strong><span>הושלמו</span></div>
            </div>
            <div className="hermes-command-cockpit__approval-queue" data-mission-control-approval-queue>
              <div>
                <strong>החלטות</strong>
                <span>{approvalCount}</span>
              </div>
              {councilDecision ? (
                <button type="button" onClick={() => setSelectedTaskId('__current__')}>
                  <strong>דיון במועצה</strong>
                  <small>מחכה להחלטה שלך</small>
                </button>
              ) : approvalTasks.length === 0 ? (
                <p>אין החלטות שמחכות לך.</p>
              ) : approvalTasks.slice(0, 3).map((task) => (
                <button key={task.id} type="button" onClick={() => setSelectedTaskId(task.id)}>
                  <strong dir="auto">{compactCopy(task.title, 44)}</strong>
                  <small>{task.agentLabel} · {task.roomLabel}</small>
                </button>
              ))}
            </div>
            <p className="hermes-command-cockpit__section-label">כל המשימות</p>
            <div className="hermes-command-cockpit__task-list hermes-command-cockpit__mission-task-list">
              {renderTaskButtons()}
            </div>
          </aside>

          <section
            className="hermes-command-cockpit__workbench hermes-command-cockpit__mission-workbench"
            data-command-bridge-region="mission-workbench"
            aria-label="Mission Workbench"
          >
            <div className="hermes-command-cockpit__panel-head">
              <strong>Mission Workbench</strong>
              <span>{focusedTask ? focusedTask.roomLabel : runVisible ? runTitle(actionRun.status) : 'בחר משימה'}</span>
            </div>
            <div className="hermes-command-cockpit__workbench-body">
              {renderWorkbench(true)}
            </div>
          </section>

          <aside
            className="hermes-command-cockpit__mission-agents"
            data-command-bridge-region="mission-agents"
            aria-label="סטטוס אייג׳נטים"
          >
            <div className="hermes-command-cockpit__panel-head">
              <strong>אייג׳נטים</strong>
              <span>{workingAgentCount} עכשיו</span>
            </div>
            <div className="hermes-command-cockpit__agent-list hermes-command-cockpit__mission-agent-list">
              {renderAgentButtons()}
            </div>
          </aside>
        </div>
      )}

      {sideStack && (
        <details className="hermes-command-cockpit__advanced">
          <summary>פרטים טכניים</summary>
          <div>{sideStack}</div>
        </details>
      )}
    </section>
  )
}
