import type { CSSProperties, ReactNode } from 'react'

import './room-workbench-primitives.css'

export type RoomWorkbenchTone = 'good' | 'warn' | 'bad' | 'neutral' | 'live' | 'locked'

export type RoomWorkbenchCommandRow = {
  id: string
  label: string
  value: ReactNode
  status: ReactNode
  next: ReactNode
  tone?: RoomWorkbenchTone
}

export function RoomWorkbenchKpiCard({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  tone?: RoomWorkbenchTone
}) {
  return (
    <article className="room-workbench-kpi" data-workbench-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  )
}

export function RoomWorkbenchGauge({
  label,
  value,
  max = 100,
  note,
  tone = 'neutral',
}: {
  label: ReactNode
  value: number
  max?: number
  note?: ReactNode
  tone?: RoomWorkbenchTone
}) {
  const safeMax = max <= 0 ? 100 : max
  const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)))
  return (
    <article
      className="room-workbench-gauge"
      data-workbench-tone={tone}
      style={{ '--room-workbench-gauge': `${pct * 3.6}deg` } as CSSProperties}
      aria-label={`${label}: ${pct}%`}
    >
      <div><strong>{pct}%</strong><span>{label}</span></div>
      {note ? <small>{note}</small> : null}
    </article>
  )
}

export function RoomWorkbenchCommandTable({
  title,
  rows,
}: {
  title: ReactNode
  rows: Array<RoomWorkbenchCommandRow>
}) {
  return (
    <section className="room-workbench-command-table" aria-label={typeof title === 'string' ? title : 'Workbench command table'}>
      <div className="room-workbench-command-table__title">{title}</div>
      {rows.map((row) => (
        <article key={row.id} data-workbench-tone={row.tone ?? 'neutral'}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          <b>{row.status}</b>
          <p>{row.next}</p>
        </article>
      ))}
    </section>
  )
}

export function RoomWorkbenchProofDetails({
  summary = 'Source proof',
  children,
}: {
  summary?: ReactNode
  children: ReactNode
}) {
  return (
    <details className="room-workbench-proof" data-proof-collapsed="true">
      <summary>{summary}</summary>
      {children}
    </details>
  )
}

export function RoomWorkbenchPillRow({
  items,
  tone = 'neutral',
  ariaLabel = 'Workbench status pills',
}: {
  items: Array<ReactNode>
  tone?: RoomWorkbenchTone
  ariaLabel?: string
}) {
  return (
    <div className="room-workbench-pill-row" data-workbench-tone={tone} aria-label={ariaLabel}>
      {items.map((item, index) => <span key={index}>{item}</span>)}
    </div>
  )
}
