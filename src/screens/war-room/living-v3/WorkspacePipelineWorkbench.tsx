import { useState } from 'react'
import { WORKSPACE_PIPELINE_OS_SCHEMA_VERSION } from '../../../lib/war-room/living-v3/workspace-pipeline-os-contract'
import type { CSSProperties, ReactNode } from 'react'

import './workspace-pipeline-workbench.css'

export type WorkspacePipelineTone = 'ready' | 'active' | 'waiting' | 'blocked' | 'locked' | 'done'

export type WorkspacePipelineStep = {
  id: string
  label: ReactNode
  status: WorkspacePipelineTone
  detail: ReactNode
  value?: ReactNode
  action?: ReactNode
}

export type WorkspacePipelineMedia = {
  id: string
  label: ReactNode
  meta: ReactNode
  src?: string | null
  tone?: WorkspacePipelineTone
  selected?: boolean
}

export type WorkspacePipelineFilter = {
  id: string
  label: ReactNode
  value: ReactNode
  active?: boolean
}

export type WorkspacePipelineAction = {
  id: string
  label: ReactNode
  detail: ReactNode
  disabled?: boolean
  locked?: boolean
  onClick?: () => void
}

export type WorkspacePipelineWorkbenchProps = {
  id: string
  eyebrow: ReactNode
  title: ReactNode
  subtitle: ReactNode
  activeArtifact: {
    label: ReactNode
    title: ReactNode
    meta: ReactNode
    src?: string | null
    emptyLabel?: ReactNode
  }
  steps: Array<WorkspacePipelineStep>
  inputMedia: Array<WorkspacePipelineMedia>
  outputMedia: Array<WorkspacePipelineMedia>
  filters?: Array<WorkspacePipelineFilter>
  actions?: Array<WorkspacePipelineAction>
  locks?: Array<ReactNode>
  readback?: ReactNode
  accent?: string
}

function toneFor(item: WorkspacePipelineStep | WorkspacePipelineMedia) {
  return 'status' in item ? item.status : item.tone ?? 'waiting'
}

function WorkspacePipelineMediaCard({ item, fallback, lane }: { item: WorkspacePipelineMedia; fallback: string; lane: 'input' | 'output' }) {
  return (
    <article
      className="workspace-pipeline__media-card"
      data-workspace-pipeline-media={item.id}
      data-workspace-pipeline-input={lane === 'input' ? item.id : undefined}
      data-workspace-pipeline-output={lane === 'output' ? item.id : undefined}
      data-pipeline-media-tone={item.tone ?? 'waiting'}
      data-pipeline-media-selected={item.selected ? 'true' : 'false'}
    >
      <div className="workspace-pipeline__media-preview">
        {item.src ? <img src={item.src} alt={typeof item.label === 'string' ? item.label : fallback} loading="lazy" /> : <span>{fallback}</span>}
      </div>
      <div>
        <b>{item.label}</b>
        <small>{item.meta}</small>
      </div>
    </article>
  )
}

function WorkspacePipelineEmptyMedia({ label, lane }: { label: string; lane: 'input' | 'output' }) {
  return (
    <article
      className="workspace-pipeline__media-card is-empty"
      data-workspace-pipeline-input={lane === 'input' ? 'empty-input' : undefined}
      data-workspace-pipeline-output={lane === 'output' ? 'empty-output' : undefined}
      data-pipeline-media-tone="waiting"
    >
      <div className="workspace-pipeline__media-preview"><span>—</span></div>
      <div>
        <b>{label}</b>
        <small>Nothing is invented; this lane fills only from real staged packets or files.</small>
      </div>
    </article>
  )
}

export function WorkspacePipelineWorkbench({
  id,
  eyebrow,
  title,
  subtitle,
  activeArtifact,
  steps,
  inputMedia,
  outputMedia,
  filters = [],
  actions = [],
  locks = [],
  readback,
  accent = '#7dd3fc',
}: WorkspacePipelineWorkbenchProps) {
  const [readbackOpen, setReadbackOpen] = useState(false)
  const doneSteps = steps.filter((step) => step.status === 'done' || step.status === 'ready').length
  const progress = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0
  return (
    <section
      className="workspace-pipeline"
      data-workspace-pipeline-os={WORKSPACE_PIPELINE_OS_SCHEMA_VERSION}
      data-pipeline-os-id={id}
      data-pipeline-teachable="true"
      data-pipeline-live-actions-allowed="false"
      data-toy-count-buttons="removed"
      data-pipeline-input-media-count={inputMedia.length}
      data-pipeline-output-media-count={outputMedia.length}
      style={{ '--pipeline-accent': accent, '--pipeline-progress': `${progress}%` } as CSSProperties}
      aria-label={typeof title === 'string' ? title : 'Workspace pipeline workbench'}
    >
      <header className="workspace-pipeline__hero">
        <article className="workspace-pipeline__artifact" data-workspace-pipeline-section="activeArtifact" data-pipeline-artifact-state={activeArtifact.src || activeArtifact.title ? 'visible' : 'empty'}>
          <div className="workspace-pipeline__artifact-preview">
            {activeArtifact.src ? <img src={activeArtifact.src} alt={typeof activeArtifact.title === 'string' ? activeArtifact.title : 'Active artifact'} loading="lazy" /> : <span>{activeArtifact.emptyLabel ?? 'ART'}</span>}
          </div>
          <div>
            <p>{activeArtifact.label}</p>
            <h3>{activeArtifact.title}</h3>
            <span>{activeArtifact.meta}</span>
          </div>
        </article>
        <div className="workspace-pipeline__copy">
          <p>{eyebrow}</p>
          <h2>{title}</h2>
          <span>{subtitle}</span>
          <div className="workspace-pipeline__progress" aria-label={`Pipeline readiness ${progress}%`}>
            <i />
            <b>{progress}%</b>
          </div>
        </div>
      </header>

      <div className="workspace-pipeline__steps" data-workspace-pipeline-section="steps" aria-label="Pipeline steps">
        {steps.map((step, index) => (
          <article key={step.id} data-workspace-pipeline-step={step.id} data-pipeline-step={step.id} data-pipeline-step-state={toneFor(step)}>
            <small>{String(index + 1).padStart(2, '0')}</small>
            <b>{step.label}</b>
            <span>{step.value ?? step.status}</span>
            <p>{step.detail}</p>
            {step.action ? <em>{step.action}</em> : null}
          </article>
        ))}
      </div>

      <div className="workspace-pipeline__media-lanes" aria-label="Pipeline media lanes">
        <section data-workspace-pipeline-section="inputMedia" data-pipeline-media-lane="inputs">
          <div className="workspace-pipeline__lane-title">
            <b>What goes in</b>
            <span>{inputMedia.length} item{inputMedia.length === 1 ? '' : 's'}</span>
          </div>
          <div className="workspace-pipeline__media-grid">
            {inputMedia.length ? inputMedia.map((item) => <WorkspacePipelineMediaCard key={item.id} item={item} fallback="IN" lane="input" />) : <WorkspacePipelineEmptyMedia label="No input selected yet" lane="input" />}
          </div>
        </section>
        <section data-workspace-pipeline-section="outputMedia" data-pipeline-media-lane="outputs">
          <div className="workspace-pipeline__lane-title">
            <b>What comes out</b>
            <span>{outputMedia.length} item{outputMedia.length === 1 ? '' : 's'}</span>
          </div>
          <div className="workspace-pipeline__media-grid">
            {outputMedia.length ? outputMedia.map((item) => <WorkspacePipelineMediaCard key={item.id} item={item} fallback="OUT" lane="output" />) : <WorkspacePipelineEmptyMedia label="No output produced yet" lane="output" />}
          </div>
        </section>
      </div>

      {(filters.length || actions.length || locks.length) ? (
        <footer className="workspace-pipeline__operator-bar">
          {filters.length ? (
            <div className="workspace-pipeline__filters" data-workspace-pipeline-section="filters" aria-label="Pipeline filters">
              {filters.map((filter) => <span key={filter.id} data-workspace-pipeline-filter={filter.id} data-pipeline-filter-active={filter.active ? 'true' : 'false'}><b>{filter.label}</b>{filter.value}</span>)}
            </div>
          ) : null}
          {actions.length ? (
            <div className="workspace-pipeline__actions" data-workspace-pipeline-section="actions" aria-label="Pipeline actions">
              {actions.map((action) => (
                <button key={action.id} type="button" disabled={action.disabled || action.locked || !action.onClick} onClick={action.onClick} data-workspace-pipeline-action={action.id} data-pipeline-action-locked={action.locked ? 'true' : 'false'}>
                  <b>{action.label}</b>
                  <span>{action.detail}</span>
                </button>
              ))}
            </div>
          ) : null}
          {locks.length ? <div className="workspace-pipeline__locks" data-workspace-pipeline-section="locks" aria-label="Locked live actions">{locks.map((lock, index) => <span key={index} data-workspace-pipeline-lock="true">{lock}</span>)}</div> : null}
        </footer>
      ) : null}

      {readback ? (
        <details
          className="workspace-pipeline__readback"
          data-workspace-pipeline-section="readback"
          data-pipeline-readback-collapsed={readbackOpen ? 'false' : 'true'}
          onToggle={(event) => setReadbackOpen(event.currentTarget.open)}
        >
          <summary>Readback / details</summary>
          {readbackOpen ? <div>{readback}</div> : null}
        </details>
      ) : null}
    </section>
  )
}
