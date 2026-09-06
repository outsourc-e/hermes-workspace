interface BentoCardProps {
  label: string
  title: string
  sub?: string
  variant?: 'hero' | 'warm' | 'cool' | 'mint'
}
const variants = {
  hero: 'bg-gradient-to-br from-indigo-700 to-violet-700 text-white',
  warm: 'bg-gradient-to-br from-rose-600 to-rose-700 text-white',
  cool: 'bg-gradient-to-br from-cyan-600 to-cyan-700 text-white',
  mint: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white',
}
export function BentoCard({
  label,
  title,
  sub,
  variant = 'hero',
}: BentoCardProps) {
  return (
    <div
      className={`${variants[variant]} rounded-lg p-4 min-h-[110px] flex flex-col justify-between`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-80 font-semibold">
        {label}
      </div>
      <div className="text-2xl font-bold leading-tight mt-2">{title}</div>
      {sub && <div className="text-xs opacity-85 mt-2 leading-snug">{sub}</div>}
    </div>
  )
}
