import type { ReactNode } from 'react'

type OracleWorkbenchProps = {
  children: ReactNode
  resultCount: number
  selectedKeyword?: string
  sourceModeLabel: string
  receipt?: string
}

export function OracleWorkbench({
  children,
  resultCount,
  selectedKeyword,
  sourceModeLabel,
  receipt,
}: OracleWorkbenchProps) {
  return (
    <section
      className="living-v3__etsy-workspace-mode living-v3__oracle-workspace-mode"
      data-oracle-primary-workspace="evidence-v1"
      data-professional-workbench="v1"
      data-room-ownership="oracle-evidence-only"
      aria-label="Oracle Evidence Workbench"
    >
      <header className="living-v3__workbench-appbar" aria-label="Oracle command bar">
        <div className="living-v3__workbench-title">
          <div>
            <p>ORACLE · EVIDENCE & INTELLIGENCE</p>
            <h2>Verify signals before execution</h2>
          </div>
        </div>
        <div className="living-v3__workbench-status" aria-label="Oracle status">
          <span>{resultCount} local signals</span>
          <span>{selectedKeyword ? `Selected: ${selectedKeyword}` : 'Search local evidence'}</span>
          <span>Read-only</span>
        </div>
      </header>

      <main className="living-v3__workbench-canvas living-v3__oracle-workspace-canvas" aria-label="Oracle evidence results">
        {children}
        {receipt && <div className="living-v3__etsy-workspace-receipt" role="status">{receipt}</div>}
      </main>

      <aside className="living-v3__workbench-inspector" aria-label="Oracle ownership and handoff">
        <section className="living-v3__workbench-card living-v3__workbench-card--primary">
          <p>Room ownership</p>
          <h3>Evidence, not discovery</h3>
          <span>Oracle validates metrics, source mode, missing proof, and confidence. It does not duplicate Goblin opportunity hunting.</span>
        </section>
        <section className="living-v3__workbench-card">
          <p>Handoff</p>
          <h3>Oracle → Etsy</h3>
          <span>Only a selected local signal packet moves into Etsy execution.</span>
        </section>
        <section className="living-v3__workbench-map-card" aria-label="Professional room boundaries">
          <p>One job per room</p>
          <div><span>Goblin finds</span><i /><b>Oracle verifies</b><i /><span>Etsy executes</span></div>
          <small>Council decides when strategy or approval is needed.</small>
        </section>
        <details className="living-v3__workbench-details" data-debug-proof-collapsed="true">
          <summary>Proof / Advanced</summary>
          <span><b>Source mode</b>{sourceModeLabel}</span>
          <span><b>Live actions</b>locked</span>
          <span><b>External writes</b>none</span>
        </details>
      </aside>
    </section>
  )
}
