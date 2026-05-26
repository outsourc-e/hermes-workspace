import type { ReactNode } from 'react';

interface HUDShellProps {
  children?: ReactNode;
}

export function HUDShell({ children }: HUDShellProps) {
  return (
    <div className="min-h-screen bg-[#0a0e14] text-[#c9d1d9] font-mono p-3">
      <header className="flex justify-between items-center pb-2 border-b border-[#21262d] mb-3">
        <div className="font-bold text-[#c4b5fd] tracking-widest text-sm">HERMES · HUD</div>
        <div className="text-[#6e7681] text-xs" data-testid="hud-meta">
          {new Date().toLocaleString('en-AU', { timeZone: 'Australia/Adelaide' })}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-3">
        <div className="flex flex-col gap-2.5">
          <section role="region" aria-label="brief" data-region="brief" className="min-h-[80px] bg-[#0d1117] border border-[#21262d] rounded-lg p-3">
            {children}
            <div className="text-xs text-[#6e7681]">Brief region</div>
          </section>
          <section role="region" aria-label="bento" data-region="bento" className="grid grid-cols-3 gap-2">
            <div className="bg-[#161b22] rounded-lg p-3 min-h-[70px] text-xs text-[#6e7681]">Up Next</div>
            <div className="bg-[#161b22] rounded-lg p-3 min-h-[70px] text-xs text-[#6e7681]">Recovery</div>
            <div className="bg-[#161b22] rounded-lg p-3 min-h-[70px] text-xs text-[#6e7681]">Next Deadline</div>
          </section>
          <section role="region" aria-label="timeline" data-region="timeline" className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3 min-h-[70px] text-xs text-[#6e7681]">
            Timeline region
          </section>
          <section role="region" aria-label="mission-control" data-region="mc" className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3 min-h-[140px] text-xs text-[#6e7681]">
            Mission Control region
          </section>
        </div>
        <section role="region" aria-label="inbox" data-region="inbox" className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3 min-h-[300px] text-xs text-[#6e7681]">
          Inbox region
        </section>
      </div>
    </div>
  );
}
