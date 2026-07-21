import './station-workbench-header.css'

type StationWorkbenchHeaderProps = {
  roomLabel: string
  stationLabel: string
  role: string
  modeLabel: string
  localOnly: boolean
  hasReadback: boolean
}

function stationMonogram(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'WR'
}

export function StationWorkbenchHeader({ roomLabel, stationLabel, role, modeLabel, localOnly, hasReadback }: StationWorkbenchHeaderProps) {
  return (
    <header className="station-workbench-header" data-station-workbench-header="v2">
      <div className="station-workbench-header__mark" aria-hidden="true">{stationMonogram(stationLabel)}</div>
      <div className="station-workbench-header__copy">
        <p>{roomLabel} · {modeLabel}</p>
        <h2>{stationLabel}</h2>
        <span>{role}</span>
      </div>
      <div className="station-workbench-header__states" aria-label="Station safety state">
        <span data-state={localOnly ? 'local' : 'connected'}><i aria-hidden="true" />{localOnly ? 'Local-only mode' : 'Runtime connected'}</span>
        <span data-state={hasReadback ? 'ready' : 'idle'}><i aria-hidden="true" />{hasReadback ? 'Readback ready' : 'No readback yet'}</span>
      </div>
    </header>
  )
}
