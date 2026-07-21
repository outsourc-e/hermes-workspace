import type { ReactNode } from 'react'

export type ToastRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

type ToastProps = {
  title: string
  children: ReactNode
  rarity?: ToastRarity
  icon?: ReactNode
  className?: string
}

const TOKENS: Record<
  ToastRarity,
  { border: string; glow: string; bg: string; title: string; icon: string }
> = {
  common: {
    border: '#c7a66c',
    glow: 'rgba(199,166,108,.28)',
    bg: 'linear-gradient(180deg, rgba(61,43,22,.94), rgba(23,17,11,.96))',
    title: '#f3dfaa',
    icon: '✦',
  },
  uncommon: {
    border: '#86efac',
    glow: 'rgba(134,239,172,.34)',
    bg: 'linear-gradient(180deg, rgba(24,58,43,.94), rgba(7,22,17,.96))',
    title: '#bbf7d0',
    icon: '◆',
  },
  rare: {
    border: '#67e8f9',
    glow: 'rgba(103,232,249,.38)',
    bg: 'linear-gradient(180deg, rgba(16,51,66,.94), rgba(5,18,28,.96))',
    title: '#a5f3fc',
    icon: '✧',
  },
  epic: {
    border: '#c4b5fd',
    glow: 'rgba(196,181,253,.44)',
    bg: 'linear-gradient(180deg, rgba(52,36,82,.94), rgba(19,12,36,.96))',
    title: '#ddd6fe',
    icon: '✹',
  },
  legendary: {
    border: '#facc15',
    glow: 'rgba(250,204,21,.55)',
    bg: 'linear-gradient(180deg, rgba(92,61,15,.95), rgba(32,20,8,.97))',
    title: '#fde68a',
    icon: '✦',
  },
}

function ToastStyles() {
  return (
    <style>{`
      @keyframes hermes-toast-enter { from { opacity: 0; transform: translateY(-12px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes hermes-toast-glint { 0% { transform: translateX(-130%); } 100% { transform: translateX(180%); } }
      .hermes-toast { position: relative; overflow: hidden; }
      .hermes-toast::before { content: ''; position: absolute; top: 0; bottom: 0; width: 42%; left: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent); transform: translateX(-130%); animation: hermes-toast-glint 2.8s ease-in-out infinite; pointer-events: none; }
      @media (max-width: 760px) { .hermes-toast-lane { top: 88px !important; width: min(76vw, 360px) !important; max-height: 28vh !important; } .hermes-toast { font-size: 12px !important; padding: 9px 11px !important; } }
    `}</style>
  )
}

export function Toast({
  title,
  children,
  rarity = 'common',
  icon,
  className = '',
}: ToastProps) {
  const t = TOKENS[rarity]
  return (
    <>
      <ToastStyles />
      <div
        className={`hermes-toast ${className}`}
        data-rarity={rarity}
        style={{
          border: `2px solid ${t.border}`,
          borderRadius: 18,
          padding: '10px 13px',
          background: t.bg,
          color: '#fff7df',
          boxShadow: `0 16px 38px rgba(0,0,0,.55), 0 0 28px ${t.glow}, inset 0 1px 0 rgba(255,255,255,.16)`,
          animation: 'hermes-toast-enter 180ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div
            style={{
              color: t.border,
              fontSize: 18,
              lineHeight: '20px',
              textShadow: `0 0 12px ${t.glow}`,
            }}
          >
            {icon ?? t.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: t.title,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
              }}
            >
              {title}
            </div>
            <div
              style={{
                marginTop: 1,
                fontSize: 13,
                fontWeight: 800,
                lineHeight: 1.25,
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function rarityForPlaygroundToast(kind: string): ToastRarity {
  if (kind === 'title') return 'legendary'
  if (kind === 'quest') return 'rare'
  if (kind === 'item') return 'uncommon'
  return 'common'
}
