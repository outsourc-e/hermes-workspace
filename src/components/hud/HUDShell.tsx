import { useState } from 'react'
import { CustomisePanel } from './CustomisePanel'
import type { ReactNode } from 'react'

interface HUDShellProps {
  brief: ReactNode
  bento: ReactNode
  timeline: ReactNode
  missionControl: ReactNode
  inbox: ReactNode
}

export function HUDShell({
  brief,
  bento,
  timeline,
  missionControl,
  inbox,
}: HUDShellProps) {
  const [customiseOpen, setCustomiseOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#0a0e14] text-[#c9d1d9] font-mono p-4 lg:p-6">
      <header className="flex justify-between items-center pb-3 border-b border-[#21262d] mb-4">
        <div className="font-bold text-[#c4b5fd] tracking-widest text-base">
          HERMES · HUD
        </div>
        <div className="flex items-center gap-3 text-[#6e7681] text-sm">
          <span>
            {new Date().toLocaleString('en-AU', {
              timeZone: 'Australia/Adelaide',
            })}
          </span>
          <button
            onClick={() => setCustomiseOpen(true)}
            className="hover:text-[#c4b5fd]"
            aria-label="customise"
          >
            ⚙
          </button>
        </div>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4">
        <div className="flex flex-col gap-4">
          <section
            role="region"
            aria-label="brief"
            className="bg-gradient-to-br from-[#1a1f2e] to-[#0d1117] border border-[#21262d] rounded-lg p-4"
          >
            {brief}
          </section>
          <section role="region" aria-label="bento">
            {bento}
          </section>
          <section
            role="region"
            aria-label="timeline"
            className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4"
          >
            {timeline}
          </section>
          <section role="region" aria-label="mission-control">
            {missionControl}
          </section>
        </div>
        <section role="region" aria-label="inbox">
          {inbox}
        </section>
      </div>
      <CustomisePanel
        open={customiseOpen}
        onClose={() => setCustomiseOpen(false)}
      />
    </div>
  )
}
