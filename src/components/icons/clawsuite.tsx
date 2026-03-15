import { useId } from 'react'

export type OpenClawStudioIconProps = {
  className?: string
  animateDots?: boolean
  dotClassName?: string
}

/**
 * Hermes Agent icon — Nous Research blue gradient with gold caduceus.
 * Replaces the original ClawSuite orange terminal icon.
 */
export function OpenClawStudioIcon({
  className,
  animateDots = false,
  dotClassName: _dotClassName,
}: OpenClawStudioIconProps) {
  const uid = useId().replace(/:/g, '')
  const gradId = `hermesBg-${uid}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#1E30AA', stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: '#3050FF', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#5070FF', stopOpacity: 1 }} />
        </linearGradient>
      </defs>

      {/* Blue background */}
      <rect x="0" y="0" width="100" height="100" rx="0" fill={`url(#${gradId})`} />

      {/* Caduceus staff */}
      <rect x="47" y="18" width="6" height="64" rx="3" fill="#FFD700" />

      {/* Top wings */}
      <path d="M 32 28 Q 50 18, 50 28" stroke="#FFD700" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 68 28 Q 50 18, 50 28" stroke="#FFD700" strokeWidth="3.5" fill="none" strokeLinecap="round" />

      {/* Left snake */}
      <path
        d="M 36 62 Q 26 52, 36 42 Q 46 32, 50 36"
        stroke="#E8ECFF"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />

      {/* Right snake */}
      <path
        d="M 64 62 Q 74 52, 64 42 Q 54 32, 50 36"
        stroke="#E8ECFF"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />

      {/* Top orb */}
      <circle cx="50" cy="18" r="6" fill="#FFD700">
        {animateDots && (
          <animate
            attributeName="opacity"
            values="1;0.5;1"
            dur="1.5s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  )
}
