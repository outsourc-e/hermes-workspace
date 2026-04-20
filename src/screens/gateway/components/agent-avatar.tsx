type AgentAccentColor = {
  bar: string
  border: string
  avatar: string
  text: string
  ring: string
  hex: string
}

export const AGENT_AVATARS = ['🔍', '✍️', '📝', '🧪', '🎨', '📊', '🛡️', '⚡', '🔬', '🎯'] as const
export const AGENT_AVATAR_COUNT = 10

const LEGACY_AGENT_AVATAR_INDEX = new Map<string, number>(
  AGENT_AVATARS.map((avatar, index) => [avatar, index]),
)

export function normalizeAgentAvatarIndex(value: unknown, fallbackIndex = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value)
    if (normalized >= 0) return normalized % AGENT_AVATAR_COUNT
  }
  if (typeof value === 'string') {
    const legacy = LEGACY_AGENT_AVATAR_INDEX.get(value.trim())
    if (legacy !== undefined) return legacy
  }
  const fallback = Math.trunc(fallbackIndex)
  return ((fallback % AGENT_AVATAR_COUNT) + AGENT_AVATAR_COUNT) % AGENT_AVATAR_COUNT
}

export function getAgentAvatarForSlot(index: number): number {
  return normalizeAgentAvatarIndex(index, 0)
}

export function resolveAgentAvatarIndex(member: unknown, index: number): number {
  const row = member && typeof member === 'object' && !Array.isArray(member)
    ? (member as Record<string, unknown>)
    : null
  return normalizeAgentAvatarIndex(row?.avatar, index)
}

export function darkenHexColor(color: string, amount = 0.2): string {
  const hex = color.trim()
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex
  const expanded =
    normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return color

  const r = Math.round(parseInt(expanded.slice(0, 2), 16) * (1 - amount))
  const g = Math.round(parseInt(expanded.slice(2, 4), 16) * (1 - amount))
  const b = Math.round(parseInt(expanded.slice(4, 6), 16) * (1 - amount))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export interface AgentAvatarProps {
  index: number
  color: string
  size?: number
  className?: string
}

export function AgentAvatar({
  index,
  color,
  size = 40,
  className,
}: AgentAvatarProps) {
  const variant = normalizeAgentAvatarIndex(index, 0)
  const shade = darkenHexColor(color, 0.2)
  const outline = darkenHexColor(color, 0.35)
  const eye = '#f8fafc'

  const baseParts = (() => {
    switch (variant) {
      case 2:
        return {
          head: (
            <>
              <rect x="16" y="9" width="16" height="12" fill={color} />
              <rect x="14" y="11" width="20" height="8" fill={color} />
              <rect x="30" y="9" width="2" height="12" fill={shade} />
              <rect x="14" y="17" width="20" height="2" fill={shade} />
              <rect x="16" y="19" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 9, rightX: 35, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
      case 3:
        return {
          head: (
            <>
              <rect x="15" y="10" width="18" height="11" fill={color} />
              <rect x="31" y="10" width="2" height="11" fill={shade} />
              <rect x="14" y="19" width="20" height="3" fill={shade} />
            </>
          ),
          body: { x: 12, y: 22, w: 24, h: 15 },
          arms: { leftX: 7, rightX: 37, y: 24, w: 5, h: 11 },
          legs: { y: 37, w: 6, h: 5, leftX: 16, rightX: 26 },
        }
      case 4:
        return {
          head: (
            <>
              <rect x="18" y="9" width="12" height="14" fill={color} />
              <rect x="28" y="9" width="2" height="14" fill={shade} />
              <rect x="18" y="21" width="12" height="2" fill={shade} />
            </>
          ),
          body: { x: 17, y: 23, w: 14, h: 15 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 4, h: 10 },
          legs: { y: 38, w: 4, h: 5, leftX: 19, rightX: 25 },
        }
      case 8:
        return {
          head: (
            <>
              <rect x="17" y="12" width="14" height="11" fill={color} />
              <rect x="29" y="12" width="2" height="11" fill={shade} />
              <rect x="17" y="21" width="14" height="2" fill={shade} />
            </>
          ),
          body: { x: 16, y: 23, w: 16, h: 12 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 3, h: 8 },
          legs: { y: 35, w: 4, h: 6, leftX: 18, rightX: 25 },
        }
      default:
        return {
          head: (
            <>
              <rect x="16" y="10" width="16" height="12" fill={color} />
              <rect x="30" y="10" width="2" height="12" fill={shade} />
              <rect x="16" y="20" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 10, rightX: 34, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
    }
  })()

  const bodyParts = (
    <>
      {baseParts.head}
      <rect x={baseParts.body.x} y={baseParts.body.y} width={baseParts.body.w} height={baseParts.body.h} fill={color} />
      <rect x={baseParts.body.x + baseParts.body.w - 2} y={baseParts.body.y} width="2" height={baseParts.body.h} fill={shade} />
      <rect x={baseParts.body.x} y={baseParts.body.y + baseParts.body.h - 2} width={baseParts.body.w} height="2" fill={shade} />
      <rect x={baseParts.arms.leftX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.rightX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.leftX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.arms.rightX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.legs.leftX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.rightX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.leftX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
      <rect x={baseParts.legs.rightX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
    </>
  )

  const details = (() => {
    switch (variant) {
      case 0:
        return (
          <>
            <rect x="23" y="6" width="2" height="4" fill={color} />
            <circle cx="24" cy="5" r="1.5" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 1:
        return (
          <>
            <rect x="17" y="14" width="14" height="5" fill={eye} opacity="0.95" />
            <rect x="17" y="18" width="14" height="1" fill={shade} />
            <rect x="19" y="28" width="10" height="2" fill={shade} />
            <rect x="13" y="15" width="3" height="2" fill={shade} />
            <rect x="32" y="15" width="3" height="2" fill={shade} />
          </>
        )
      case 2:
        return (
          <>
            <circle cx="19" cy="16" r="2.2" fill={eye} />
            <circle cx="29" cy="16" r="2.2" fill={eye} />
            <rect x="20" y="20" width="8" height="2" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
          </>
        )
      case 3:
        return (
          <>
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="16" y="18" width="16" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={outline} />
            <rect x="16" y="31" width="16" height="2" fill={shade} />
          </>
        )
      case 4:
        return (
          <>
            <circle cx="21" cy="16" r="1.7" fill={eye} />
            <circle cx="27" cy="16" r="1.7" fill={eye} />
            <rect x="22" y="20" width="4" height="1" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
            <rect x="21" y="32" width="6" height="1" fill={outline} />
          </>
        )
      case 5:
        return (
          <>
            <rect x="18" y="5" width="2" height="5" fill={color} />
            <rect x="28" y="5" width="2" height="5" fill={color} />
            <circle cx="19" cy="4" r="1.6" fill={eye} />
            <circle cx="29" cy="4" r="1.6" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={shade} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 6:
        return (
          <>
            <circle cx="24" cy="16" r="3.2" fill={eye} />
            <circle cx="24" cy="16" r="1.3" fill={shade} />
            <rect x="18" y="20" width="12" height="2" fill={outline} />
            <rect x="17" y="28" width="2" height="2" fill={shade} />
            <rect x="19" y="30" width="2" height="2" fill={shade} />
            <rect x="21" y="28" width="2" height="2" fill={shade} />
            <rect x="23" y="30" width="2" height="2" fill={shade} />
            <rect x="25" y="28" width="2" height="2" fill={shade} />
            <rect x="27" y="30" width="2" height="2" fill={shade} />
            <rect x="29" y="28" width="2" height="2" fill={shade} />
          </>
        )
      case 7:
        return (
          <>
            <rect x="21" y="7" width="6" height="3" fill={color} />
            <rect x="22" y="5" width="4" height="2" fill={color} />
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="17" y="18" width="14" height="2" fill={outline} />
            <rect x="19" y="28" width="10" height="2" fill={outline} />
          </>
        )
      case 8:
        return (
          <>
            <circle cx="20" cy="17" r="2.3" fill={eye} />
            <circle cx="28" cy="17" r="2.3" fill={eye} />
            <rect x="21" y="21" width="6" height="1" fill={shade} />
            <rect x="20" y="27" width="8" height="2" fill={shade} />
          </>
        )
      case 9:
      default:
        return (
          <>
            <circle cx="19" cy="16" r="2.4" fill={eye} />
            <circle cx="29" cy="16" r="1.4" fill={eye} />
            <rect x="17" y="20" width="4" height="1" fill={shade} />
            <rect x="23" y="20" width="3" height="1" fill={shade} />
            <rect x="28" y="20" width="2" height="1" fill={shade} />
            <rect x="18" y="28" width="2" height="2" fill={outline} />
            <rect x="20" y="30" width="2" height="2" fill={outline} />
            <rect x="22" y="28" width="2" height="2" fill={outline} />
            <rect x="24" y="30" width="2" height="2" fill={outline} />
            <rect x="26" y="28" width="2" height="2" fill={outline} />
            <rect x="28" y="30" width="2" height="2" fill={outline} />
            <rect x="31" y="24" width="2" height="4" fill={shade} />
          </>
        )
    }
  })()

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className={className}
      shapeRendering="crispEdges"
    >
      <rect x="5" y="5" width="38" height="38" fill={color} opacity="0.08" />
      <rect x="7" y="7" width="34" height="34" fill="white" opacity="0.92" />
      <rect x="7" y="7" width="34" height="34" fill="none" stroke={outline} strokeWidth="1" />
      {bodyParts}
      {details}
    </svg>
  )
}

export const AGENT_ACCENT_COLORS: AgentAccentColor[] = [
  { bar: 'bg-orange-500', border: 'border-orange-500', avatar: 'bg-orange-100', text: 'text-orange-600', ring: 'ring-orange-500/20' },
  { bar: 'bg-blue-500', border: 'border-blue-500', avatar: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-500/20' },
  { bar: 'bg-violet-500', border: 'border-violet-500', avatar: 'bg-violet-100', text: 'text-violet-600', ring: 'ring-violet-500/20' },
  { bar: 'bg-emerald-500', border: 'border-emerald-500', avatar: 'bg-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-500/20' },
  { bar: 'bg-rose-500', border: 'border-rose-500', avatar: 'bg-rose-100', text: 'text-rose-600', ring: 'ring-rose-500/20' },
  { bar: 'bg-amber-500', border: 'border-amber-500', avatar: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-500/20' },
  { bar: 'bg-cyan-500', border: 'border-cyan-500', avatar: 'bg-cyan-100', text: 'text-cyan-600', ring: 'ring-cyan-500/20' },
  { bar: 'bg-fuchsia-500', border: 'border-fuchsia-500', avatar: 'bg-fuchsia-100', text: 'text-fuchsia-600', ring: 'ring-fuchsia-500/20' },
  { bar: 'bg-lime-500', border: 'border-lime-500', avatar: 'bg-lime-100', text: 'text-lime-700', ring: 'ring-lime-500/20' },
  { bar: 'bg-sky-500', border: 'border-sky-500', avatar: 'bg-sky-100', text: 'text-sky-600', ring: 'ring-sky-500/20' },
].map((accent, index) => ({
  ...accent,
  hex: ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#d946ef', '#84cc16', '#0ea5e9'][index] ?? '#f97316',
}))
