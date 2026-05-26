interface BriefProps { text: string; subtitle: string; onRegen?: () => void; }
export function Brief({ text, subtitle, onRegen }: BriefProps) {
  return (
    <div>
      <div className="text-[8px] text-[#8b949e] tracking-[2px] mb-1.5 flex justify-between">
        <span>{subtitle}</span>
        {onRegen && <button onClick={onRegen} className="text-[#58a6ff] hover:underline">↻ regen</button>}
      </div>
      <div className="font-serif text-[13px] leading-relaxed text-[#e6edf3]">{text}</div>
    </div>
  );
}
