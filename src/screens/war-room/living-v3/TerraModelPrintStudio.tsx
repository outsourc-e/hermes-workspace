import {  useEffect, useState } from 'react'
import type {ReactNode} from 'react';

export type TerraStudioAction = {
  id: string
  label: string
  hint: string
  disabled?: boolean
  run: () => void
}

export type TerraStudioPipelineStage = {
  id: string
  label: string
  state: string
  value: string
  onClick?: () => void
}

export type TerraStudioMaterialOption = {
  id: string
  label: string
  material: string
  color?: string
  note?: string
  active?: boolean
  disabled?: boolean
  onSelect?: () => void
}

export type TerraStudioControl = TerraStudioAction & {
  tone?: 'safe' | 'warn' | 'danger'
}

export type TerraModelPrintStudioProps = {
  model: {
    title: string
    meta: string
    image?: string
    src?: string
  }
  actions: Array<TerraStudioAction>
  pipeline?: Array<TerraStudioPipelineStage>
  steps?: Array<TerraStudioPipelineStage>
  specs?: Array<{ label: string; value: string; tone?: string }>
  readback?: Array<{ label: string; value: string; meta?: string }>
  production?: {
    camera: {
      title: string
      status: string
      liveLabel: string
      imageSrc?: string
      actionLabel: string
      actionDisabled?: boolean
      inspectLabel?: string
      inspectDisabled?: boolean
      onRefresh?: () => void
      onInspect?: () => void
    }
    printer: {
      name: string
      connection: string
      progress: string
      temps: string
      lifecycle: string
      jobName: string
      controls: Array<TerraStudioControl>
    }
    material: {
      selectedLabel: string
      selectedMaterial?: string
      color?: string
      supportNote?: string
      options: Array<TerraStudioMaterialOption>
    }
    profiles?: Array<{
      label: string
      value: string
      meta?: string
    }>
    lockedActions?: Array<string>
  }
  fallback?: ReactNode
}

function compact(value: string) {
  return value.replaceAll('_', ' ')
}

function stageState(value: string) {
  if (value === 'ready' || value === 'complete') return 'ready'
  if (value === 'running' || value === 'active' || value === 'waiting') return 'active'
  if (value === 'blocked' || value === 'locked') return 'locked'
  return 'idle'
}

function connectionState(value: string) {
  const label = value.toLowerCase()
  if (label.includes('live') || label.includes('ready')) return 'ready'
  if (label.includes('unreachable') || label.includes('offline') || label.includes('setup')) return 'blocked'
  return 'idle'
}

function chooseTaskAction(actions: Array<TerraStudioAction>) {
  const preferred = ['slice', 'prepare', 'choose']
  for (const id of preferred) {
    const action = actions.find((candidate) => candidate.id === id && !candidate.disabled)
    if (action) return action
  }
  return actions.find((action) => !action.disabled) ?? actions[0]
}

function CameraViewport({ camera }: { camera: NonNullable<TerraModelPrintStudioProps['production']>['camera'] }) {
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(camera.imageSrc ? 'loading' : 'idle')

  useEffect(() => {
    setLoadState(camera.imageSrc ? 'loading' : 'idle')
  }, [camera.imageSrc])

  const imageReady = Boolean(camera.imageSrc && loadState === 'ready')
  const imageFailed = Boolean(camera.imageSrc && loadState === 'error')
  const runCameraAction = imageReady && camera.onInspect ? camera.onInspect : camera.onRefresh
  const actionLabel = imageReady && camera.onInspect
    ? camera.inspectLabel ?? 'Inspect frame'
    : imageFailed
      ? 'Retry camera'
      : camera.actionLabel
  const actionDisabled = imageReady
    ? camera.inspectDisabled
    : camera.actionDisabled || !camera.onRefresh || loadState === 'loading'

  return (
    <figure className="terra-camera" data-terra-camera-state={loadState}>
      <div className="terra-camera__osd">
        <span className="terra-camera__signal" data-state={imageReady ? 'ready' : camera.imageSrc ? 'active' : 'idle'}>
          <i aria-hidden="true" />
          {imageReady ? 'Verified frame' : camera.liveLabel}
        </span>
        <span className="terra-camera__source">READ-ONLY CAMERA</span>
      </div>

      {camera.imageSrc ? (
        <img
          className="terra-camera__image"
          src={camera.imageSrc}
          alt="Real read-only printer camera frame"
          onLoad={() => setLoadState('ready')}
          onError={() => setLoadState('error')}
        />
      ) : null}

      {!imageReady ? (
        <div className="terra-camera__empty" role="status">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M16 17.5 19.2 13h9.6l3.2 4.5h5A4 4 0 0 1 41 21v16H7V21a4 4 0 0 1 4-3.5h5Z" />
            <circle cx="24" cy="27" r="7" />
            <path d="m10 8 28 32" />
          </svg>
          <b>{imageFailed ? 'Camera request failed' : camera.title}</b>
          <p>{imageFailed ? 'No image was returned. The workspace will not substitute a simulated feed.' : camera.status}</p>
        </div>
      ) : null}

      <figcaption className="terra-camera__caption">
        <span>{imageReady ? 'Frame received from the printer route.' : 'No background polling. One request only when you choose it.'}</span>
        <button
          type="button"
          className="terra-camera__action"
          data-terra-camera-action={imageReady ? 'inspect-frame' : 'request-frame'}
          disabled={actionDisabled}
          onClick={runCameraAction}
        >
          {loadState === 'loading' ? 'Requesting…' : actionLabel}
        </button>
      </figcaption>
    </figure>
  )
}

function PrinterInspector({ production, profiles }: {
  production: NonNullable<TerraModelPrintStudioProps['production']>
  profiles: Array<{ label: string; value: string; meta?: string }>
}) {
  const lifecycle = production.printer.lifecycle || 'unknown'
  return (
    <aside className="terra-inspector" aria-label="Print setup inspector">
      <section className="terra-inspector__section terra-inspector__machine">
        <div className="terra-inspector__heading">
          <span>PRINTER</span>
          <i data-state={connectionState(production.printer.connection)} aria-hidden="true" />
        </div>
        <strong>{production.printer.name}</strong>
        <dl>
          <div><dt>Connection</dt><dd>{production.printer.connection}</dd></div>
          <div><dt>Lifecycle</dt><dd>{compact(lifecycle)}</dd></div>
          <div><dt>Progress</dt><dd>{production.printer.progress}</dd></div>
          <div><dt>Bed / nozzle</dt><dd>{production.printer.temps}</dd></div>
        </dl>
        <p className="terra-inspector__job">{production.printer.jobName}</p>
      </section>

      <section className="terra-inspector__section">
        <div className="terra-inspector__heading"><span>MATERIAL</span></div>
        <strong className="terra-inspector__selection">{production.material.selectedLabel}</strong>
        <div className="terra-inspector__materials" aria-label="Local material profiles">
          {production.material.options.length ? production.material.options.slice(0, 6).map((option) => (
            <button
              key={option.id}
              type="button"
              className="terra-inspector__material"
              data-terra-color-option={option.id}
              data-active={option.active ? 'true' : 'false'}
              title={`${option.label} · ${option.material}${option.note ? ` · ${option.note}` : ''}`}
              aria-label={`${option.label}, ${option.material}`}
              disabled={option.disabled}
              onClick={option.onSelect}
            >
              <i style={{ background: option.color || '#7f8792' }} aria-hidden="true" />
              <span>{option.material}</span>
            </button>
          )) : <span className="terra-inspector__muted">No local profiles</span>}
        </div>
      </section>

      <section className="terra-inspector__section terra-inspector__profiles">
        <div className="terra-inspector__heading"><span>ACTIVE PROFILES</span></div>
        <dl>
          {profiles.slice(0, 4).map((profile) => (
            <div key={`${profile.label}-${profile.value}`} title={profile.meta}>
              <dt>{profile.label}</dt>
              <dd>{profile.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  )
}

function ModelStrip({ model }: { model: TerraModelPrintStudioProps['model'] }) {
  const image = model.image ?? model.src
  return (
    <section className="terra-model-strip" aria-label="Selected model">
      <div className="terra-model-strip__preview">
        {image ? <img src={image} alt="Selected 3D model preview" /> : <span>3MF</span>}
      </div>
      <div className="terra-model-strip__copy">
        <span>SELECTED MODEL</span>
        <strong>{model.title}</strong>
        <small title={model.meta}>{model.meta}</small>
      </div>
    </section>
  )
}

export function TerraModelPrintStudio({ model, actions, pipeline, steps, specs, readback, production, fallback }: TerraModelPrintStudioProps) {
  if (!production) {
    return (
      <section className="terra-model-studio terra-model-studio--fallback" data-terra-primary-ui="camera-workbench-v9">
        {fallback}
      </section>
    )
  }

  const taskAction = chooseTaskAction(actions)
  const refreshAction = production.printer.controls.find((control) => control.id === 'refresh-readback')
  const approvalAction = production.printer.controls.find((control) => control.id === 'stage-approval')
  const dockActions = [refreshAction, taskAction, approvalAction].filter((action): action is TerraStudioAction | TerraStudioControl => Boolean(action))
  const primaryActionCount = dockActions.length + 1
  const workflowStages = pipeline ?? steps ?? []
  const inspectorProfiles = production.profiles
    ?? specs?.map((spec) => ({ label: spec.label, value: spec.value }))
    ?? readback?.slice(0, 4)
    ?? []

  return (
    <section
      className="terra-model-studio terra-model-studio--production"
      data-terra-primary-ui="camera-workbench-v9"
      data-terra-production-cockpit="true"
      data-terra-camera-first="true"
      data-terra-primary-action-count={primaryActionCount}
      data-terra-advanced-default="closed"
      data-terra-no-auto-polling="true"
      data-terra-map-scope="unchanged"
      data-terra-live-writes="locked"
    >
      <header className="terra-studio-bar">
        <div>
          <span className="terra-studio-bar__eyebrow">TERRA / MODELING STUDIO</span>
          <h2>Print preparation cockpit</h2>
        </div>
        <div className="terra-studio-bar__readbacks" aria-label="Current readback summary">
          <span><i data-state={connectionState(production.printer.connection)} />{production.printer.connection}</span>
          <span>{compact(production.printer.lifecycle || 'unknown')}</span>
          <span>{production.printer.temps}</span>
          <span className="terra-studio-bar__locked">WRITES LOCKED</span>
        </div>
      </header>

      <div className="terra-workbench">
        <div className="terra-workbench__stage">
          <CameraViewport camera={production.camera} />
          <ModelStrip model={model} />
        </div>
        <PrinterInspector production={production} profiles={inspectorProfiles} />
      </div>

      <nav className="terra-action-dock" aria-label="Primary studio actions">
        <div className="terra-action-dock__label">
          <span>MANUAL CONTROLS</span>
          <small>{primaryActionCount} bounded actions</small>
        </div>
        <div className="terra-action-dock__buttons">
          {dockActions.map((action) => {
            const control = action as TerraStudioControl
            return (
              <button
                key={action.id}
                type="button"
                data-terra-studio-action={action.id}
                data-tone={control.tone ?? (action.id === 'slice' ? 'primary' : 'neutral')}
                disabled={action.disabled}
                title={action.hint}
                onClick={action.run}
              >
                <span>{action.label}</span>
                <small>{action.hint}</small>
              </button>
            )
          })}
        </div>
      </nav>

      <ol className="terra-pipeline" aria-label="Print preparation pipeline">
        {workflowStages.slice(0, 6).map((stage, index) => (
          <li key={stage.id} data-terra-studio-step={stage.id} data-state={stageState(stage.state)} onClick={stage.onClick}>
            <i aria-hidden="true">{index + 1}</i>
            <span>{stage.label}</span>
            <small>{stage.value}</small>
          </li>
        ))}
      </ol>

    </section>
  )
}

export default TerraModelPrintStudio
