import { bidiClassNameFor, textDirectionFor } from '../../../lib/war-room/living-v3/bidi-text'
import type { ReactNode } from 'react'

export type HermesCockpitStatus = 'idle' | 'running' | 'completed' | 'blocked' | 'failed'

type HermesCommandCockpitProps = {
  prompt: string
  onPromptChange: (value: string) => void
  onRun: () => void
  canRun: boolean
  runStatus: HermesCockpitStatus
  runLabel: string
  frozen: boolean
  controlTitle: string
  focusMeta: string
  focusTitle: string
  focusBody: string
  focusNext: string
  actionIntent: string
  actionCapability: string
  assignedAgentId: string
  targetRoomId?: string
  targetStationId?: string
  hasHermesAnswer: boolean
  sourceDetails?: ReactNode
}

const statusLabel: Record<HermesCockpitStatus, string> = {
  idle: 'מוכן לבקשה',
  running: 'Hermes עובד',
  completed: 'תוצר מוכן',
  blocked: 'ממתין להחלטה',
  failed: 'נעצר בבטחה',
}

export function HermesCommandCockpit({
  prompt,
  onPromptChange,
  onRun,
  canRun,
  runStatus,
  runLabel,
  frozen,
  controlTitle,
  focusMeta,
  focusTitle,
  focusBody,
  focusNext,
  actionIntent,
  actionCapability,
  assignedAgentId,
  targetRoomId,
  targetStationId,
  hasHermesAnswer,
  sourceDetails,
}: HermesCommandCockpitProps) {
  const hasPrompt = prompt.trim().length > 0
  const activeStep = runStatus === 'running' ? 2 : runStatus === 'completed' ? 3 : hasPrompt ? 1 : 0
  const steps = [
    ['01', 'בקשה'],
    ['02', 'ניתוב'],
    ['03', 'Agent'],
    ['04', 'אישור'],
  ] as const

  return (
    <main
      className={`hermes-command-cockpit is-${runStatus}`}
      data-hermes-command-cockpit="action-cockpit-v1"
      data-hermes-command-cockpit-status={runStatus}
      dir="rtl"
    >
      <header className="hermes-command-cockpit__hero">
        <div className="hermes-command-cockpit__portrait" aria-hidden="true">
          <img src="/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png" alt="" />
          <i className={runStatus === 'running' ? 'is-running' : ''} />
        </div>
        <div className="hermes-command-cockpit__identity">
          <span>HERMES COMMAND</span>
          <h2>מה תרצה שיקרה עכשיו?</h2>
          <p>כתוב מטרה אחת. Hermes ינתב אותה, יציג את העבודה ויעצור לפני פעולה חיצונית.</p>
        </div>
        <div className="hermes-command-cockpit__safety" title={controlTitle} data-command-safety={frozen ? 'frozen' : 'manual'}>
          <i />
          <span>{frozen ? 'SAFE MODE' : 'MANUAL MODE'}</span>
          <b>{frozen ? 'פעולות חיצוניות נעולות' : 'שליטה ידנית'}</b>
        </div>
      </header>

      <nav className="hermes-command-cockpit__spine" aria-label="מסלול ביצוע הבקשה">
        {steps.map(([number, label], index) => (
          <span key={number} className={index < activeStep ? 'is-done' : index === activeStep ? 'is-active' : ''}>
            <i>{index < activeStep ? '✓' : number}</i>
            <b>{label}</b>
          </span>
        ))}
      </nav>

      <section className="hermes-command-cockpit__ask" aria-label="בקשה להרמס">
        <label>
          <span>המשימה שלך</span>
          <kbd>⌘ K</kbd>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            dir="auto"
            placeholder="לדוגמה: קח את החלטת המועצה ובנה תוכנית עבודה עם שלבים, בעלים ובדיקות…"
          />
        </label>
        <button
          type="button"
          className="hermes-command-cockpit__run"
          onClick={onRun}
          disabled={!canRun || runStatus === 'running' || !hasPrompt}
          title={canRun ? runLabel : 'Open with bodyRuntime=1 to talk to Hermes Command'}
          data-command-cockpit-run="true"
        >
          <span>{runStatus === 'running' ? 'עובד עכשיו' : 'שלח ל-Hermes'}</span>
          <b aria-hidden="true">←</b>
        </button>
      </section>

      <section
        className={`hermes-command-cockpit__canvas is-${runStatus}`}
        role="status"
        data-command-focus-canvas="text-driven-v2"
        data-command-action-card="natural-v1"
        data-command-action-status={runStatus}
        data-command-action-intent={actionIntent}
        data-command-action-capability={actionCapability}
        data-command-action-agent={assignedAgentId}
        data-command-action-room={targetRoomId ?? ''}
        data-command-action-station={targetStationId ?? ''}
        data-hermes-command-answer={hasHermesAnswer ? 'true' : 'false'}
      >
        <div className="hermes-command-cockpit__canvas-state">
          <span>{statusLabel[runStatus]}</span>
          <i aria-hidden="true" />
        </div>
        <div className="hermes-command-cockpit__canvas-copy">
          <small>{focusMeta || 'Hermes Command · Safe mode'}</small>
          <h3 className={bidiClassNameFor(focusTitle)} dir={textDirectionFor(focusTitle)}>{focusTitle}</h3>
          <p className={bidiClassNameFor(focusBody)} dir={textDirectionFor(focusBody)}>{focusBody}</p>
          {hasPrompt && (
            <blockquote className={bidiClassNameFor(prompt)} dir={textDirectionFor(prompt)}>{prompt.trim()}</blockquote>
          )}
        </div>
        <footer>
          <span>השלב הבא</span>
          <b className={bidiClassNameFor(focusNext)} dir={textDirectionFor(focusNext)}>{focusNext}</b>
        </footer>
      </section>

      {sourceDetails && <div className="hermes-command-cockpit__sources">{sourceDetails}</div>}
    </main>
  )
}
