import { createFileRoute } from '@tanstack/react-router'
import React from 'react'

export const Route = createFileRoute('/jarvis')({
  component: JarvisPage,
  ssr: false,
})

function JarvisPage() {
  return (
    <div
      className="fixed inset-0 w-screen h-screen bg-[#0a0e1a] text-[#e0f0ff] overflow-auto"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;900&family=Rajdhani:wght@300;400;500;600;700&display=swap');
        
        .hud-scanlines {
          position: fixed; inset: 0; pointer-events: none; z-index: 9999;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,217,255,0.015) 2px, rgba(0,217,255,0.015) 4px);
        }
        @keyframes scanbeam { 0%{top:-2px} 100%{top:100%} }
        .hud-scanbeam {
          position:fixed; left:0; right:0; height:2px;
          background:linear-gradient(90deg,transparent,rgba(0,217,255,0.15),transparent);
          animation:scanbeam 10s linear infinite;
          pointer-events:none; z-index:9998;
        }
        @keyframes gridMove { 0%{transform:translateY(0)} 100%{transform:translateY(50px)} }
        .hud-bg-grid {
          position:fixed; inset:0; z-index:0; pointer-events:none;
          background-image:
            linear-gradient(rgba(0,217,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,217,255,0.025) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: gridMove 25s linear infinite;
        }
        @keyframes cornerPulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
        .hud-corner { position:fixed; z-index:9997; animation: cornerPulse 4s ease-in-out infinite; pointer-events:none; }
        .hud-corner-tl { top:20px; left:20px; width:60px; height:60px; border-top:2px solid rgba(0,217,255,0.3); border-left:2px solid rgba(0,217,255,0.3); }
        .hud-corner-tr { top:20px; right:20px; width:60px; height:60px; border-top:2px solid rgba(0,217,255,0.3); border-right:2px solid rgba(0,217,255,0.3); }
        .hud-corner-bl { bottom:20px; left:20px; width:60px; height:60px; border-bottom:2px solid rgba(0,217,255,0.3); border-left:2px solid rgba(0,217,255,0.3); }
        .hud-corner-br { bottom:20px; right:20px; width:60px; height:60px; border-bottom:2px solid rgba(0,217,255,0.3); border-right:2px solid rgba(0,217,255,0.3); }
        
        @keyframes particleFloat { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-10px) scale(1.05)} }
        .hud-particles {
          position:fixed; inset:0; z-index:0; pointer-events:none; opacity:0.08;
          background-image: radial-gradient(circle, #00d9ff 1px, transparent 1px);
          background-size: 80px 80px;
          animation: particleFloat 20s ease-in-out infinite;
        }
      `}</style>

      <div className="hud-scanlines" />
      <div className="hud-scanbeam" />
      <div className="hud-bg-grid" />
      <div className="hud-particles" />
      <div className="hud-corner hud-corner-tl" />
      <div className="hud-corner hud-corner-tr" />
      <div className="hud-corner hud-corner-bl" />
      <div className="hud-corner hud-corner-br" />

      {/* Content area */}
      <div className="relative z-10 min-h-screen flex flex-col">
        <main className="flex-1 flex flex-col w-full max-w-[98vw] mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-4">
          <JarvisContent />
        </main>
        <footer className="flex-shrink-0 text-center py-1 text-[9px] sm:text-[10px] text-[rgba(224,240,255,0.2)] tracking-[0.15em] uppercase font-['Orbitron']">
          HERMES WORKSPACE · JARVIS BRIEFING
        </footer>
      </div>
    </div>
  )
}

function JarvisContent() {
  return <JarvisMain />
}

function JarvisMain() {
  const [Comp, setComp] = React.useState<React.ComponentType<any> | null>(null)
  React.useEffect(() => {
    let cancelled = false
    import('../screens/jarvis/jarvis-screen').then((m) => {
      if (!cancelled) setComp(() => m.default)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Comp) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="text-center">
          <div className="text-[#00d9ff] text-xs sm:text-sm font-['Orbitron'] tracking-[0.2em] opacity-60">
            SYSTEM INITIALIZING<span className="hud-blink">_</span>
          </div>
        </div>
      </div>
    )
  }

  return <Comp />
}
