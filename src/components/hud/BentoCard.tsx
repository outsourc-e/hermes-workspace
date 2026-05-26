interface BentoCardProps { label: string; title: string; sub?: string; variant?: 'hero'|'warm'|'cool'|'mint'; }
const variants = {
  hero: 'bg-gradient-to-br from-indigo-700 to-violet-700 text-white',
  warm: 'bg-gradient-to-br from-rose-600 to-rose-700 text-white',
  cool: 'bg-gradient-to-br from-cyan-600 to-cyan-700 text-white',
  mint: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white',
};
export function BentoCard({ label, title, sub, variant = 'hero' }: BentoCardProps) {
  return (
    <div className={`${variants[variant]} rounded-lg p-3 min-h-[70px]`}>
      <div className="text-[8px] uppercase tracking-wider opacity-85">{label}</div>
      <div className="text-lg font-bold leading-tight mt-1">{title}</div>
      {sub && <div className="text-[9px] opacity-85 mt-1">{sub}</div>}
    </div>
  );
}
