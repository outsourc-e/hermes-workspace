import type { CSSProperties, ReactNode } from 'react'

export type SpeechBubbleVariant =
  | 'npc'
  | 'player'
  | 'system'
  | 'whisper'
  | 'party'
export type SpeechBubbleTail = 'bottom' | 'left' | 'right' | 'none'

type SpeechBubbleProps = {
  children: ReactNode
  variant?: SpeechBubbleVariant
  tail?: SpeechBubbleTail
  accent?: string
  name?: string
  portraitSrc?: string
  portraitAlt?: string
  className?: string
  style?: CSSProperties
  compact?: boolean
}

const VARIANT_TOKENS: Record<
  SpeechBubbleVariant,
  { ink: string; label: string; border: string; bg: string; glow: string }
> = {
  npc: {
    ink: '#3d2a12',
    label: '#8a5a10',
    border: '#F1C56D',
    bg: 'linear-gradient(180deg, rgba(244,233,211,.98), rgba(218,187,120,.96))',
    glow: 'rgba(241,197,109,.42)',
  },
  player: {
    ink: '#10251e',
    label: '#166044',
    border: '#86efac',
    bg: 'linear-gradient(180deg, rgba(221,255,231,.98), rgba(154,230,180,.96))',
    glow: 'rgba(134,239,172,.42)',
  },
  system: {
    ink: '#29180a',
    label: '#9a5f10',
    border: '#facc15',
    bg: 'linear-gradient(180deg, rgba(255,247,208,.98), rgba(245,211,121,.96))',
    glow: 'rgba(250,204,21,.48)',
  },
  whisper: {
    ink: '#241337',
    label: '#7e4ec7',
    border: '#c4b5fd',
    bg: 'linear-gradient(180deg, rgba(246,241,255,.98), rgba(216,203,250,.95))',
    glow: 'rgba(196,181,253,.42)',
  },
  party: {
    ink: '#092432',
    label: '#0e7490',
    border: '#67e8f9',
    bg: 'linear-gradient(180deg, rgba(230,253,255,.98), rgba(165,243,252,.95))',
    glow: 'rgba(103,232,249,.44)',
  },
}

function SpeechBubbleStyles() {
  return (
    <style>{`
      @keyframes hermes-speech-bubble-in { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes hermes-speech-tail-wag { 0%, 100% { transform: translateX(-50%) rotate(45deg); } 50% { transform: translateX(-50%) rotate(38deg); } }
      @keyframes hermes-speech-tail-left-wag { 0%, 100% { transform: translateY(-50%) rotate(45deg); } 50% { transform: translateY(-50%) rotate(52deg); } }
      .hermes-speech-bubble { position: relative; isolation: isolate; }
      .hermes-speech-bubble::before { content: ''; position: absolute; inset: 5px; border-radius: inherit; border: 1px solid rgba(138,86,24,.28); pointer-events: none; opacity: .85; }
      .hermes-speech-bubble[data-variant='npc'] { clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 7px), 0 7px); }
      .hermes-speech-bubble[data-variant='npc']::before { box-shadow: inset 0 0 18px rgba(184,134,43,.18); }
      .hermes-speech-bubble[data-tail='bottom']::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 14px; height: 14px; border-right: 2px solid var(--speech-border); border-bottom: 2px solid var(--speech-border); background: var(--speech-tail-bg); transform: translateX(-50%) rotate(45deg); animation: hermes-speech-tail-wag 1.9s ease-in-out infinite; }
      .hermes-speech-bubble[data-tail='left']::after { content: ''; position: absolute; left: -7px; top: 50%; width: 14px; height: 14px; border-left: 2px solid var(--speech-border); border-bottom: 2px solid var(--speech-border); background: var(--speech-tail-bg); transform: translateY(-50%) rotate(45deg); animation: hermes-speech-tail-left-wag 2.1s ease-in-out infinite; }
      .hermes-speech-bubble[data-tail='right']::after { content: ''; position: absolute; right: -7px; top: 50%; width: 14px; height: 14px; border-right: 2px solid var(--speech-border); border-top: 2px solid var(--speech-border); background: var(--speech-tail-bg); transform: translateY(-50%) rotate(45deg); animation: hermes-speech-tail-left-wag 2.1s ease-in-out infinite reverse; }
      @media (max-width: 760px) { .hermes-world-bubble { max-width: min(56vw, 220px) !important; font-size: 11px !important; line-height: 1.25 !important; } }
    `}</style>
  )
}

export function SpeechBubble({
  children,
  variant = 'npc',
  tail = 'bottom',
  accent,
  name,
  portraitSrc,
  portraitAlt,
  className = '',
  style,
  compact = false,
}: SpeechBubbleProps) {
  const tokens = VARIANT_TOKENS[variant]
  const border = accent || tokens.border
  return (
    <>
      <SpeechBubbleStyles />
      <div
        className={`hermes-speech-bubble ${className}`}
        data-tail={tail}
        data-variant={variant}
        style={{
          ['--speech-border' as any]: border,
          ['--speech-tail-bg' as any]: tokens.bg,
          maxWidth: compact ? 220 : 520,
          border: `2px solid ${border}`,
          borderRadius: compact ? 10 : 16,
          padding: compact ? '8px 12px' : '13px 16px',
          background: tokens.bg,
          color: tokens.ink,
          boxShadow: `0 12px 28px rgba(10,13,18,.38), 0 0 18px ${tokens.glow}, inset 0 2px 0 rgba(255,255,255,.42), inset 0 -10px 18px rgba(184,134,43,.14)`,
          fontSize: compact ? 12 : 14,
          fontWeight: 700,
          lineHeight: 1.35,
          textAlign: compact ? 'center' : 'left',
          animation: 'hermes-speech-bubble-in 180ms cubic-bezier(.2,.8,.2,1)',
          ...style,
        }}
      >
        <div style={{ display: portraitSrc ? 'flex' : 'block', gap: compact ? 8 : 12, alignItems: 'flex-start' }}>
          {portraitSrc ? (
            <img
              src={portraitSrc}
              alt={portraitAlt || name || 'NPC portrait'}
              loading="lazy"
              style={{
                width: compact ? 42 : 64,
                height: compact ? 42 : 64,
                flex: '0 0 auto',
                borderRadius: compact ? 12 : 16,
                border: `2px solid ${border}`,
                objectFit: 'cover',
                objectPosition: 'center',
                background: 'rgba(0,0,0,.18)',
                boxShadow: `0 0 14px ${tokens.glow}`,
              }}
              onError={(event) => {
                ;(event.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : null}
          <div>
            {name ? (
              <div
                style={{
                  color: accent || tokens.label,
                  fontSize: compact ? 9 : 10,
                  fontWeight: 900,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  marginBottom: compact ? 2 : 5,
                }}
              >
                {name}
              </div>
            ) : null}
            <div>{children}</div>
          </div>
        </div>
      </div>
    </>
  )
}
