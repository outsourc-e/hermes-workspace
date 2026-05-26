import { BentoCard } from './BentoCard';
export interface BentoRowProps {
  upNext: { label: string; title: string; sub?: string };
  recovery: { label: string; title: string; sub?: string };
  nextDeadline: { label: string; title: string; sub?: string };
}
export function BentoRow({ upNext, recovery, nextDeadline }: BentoRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-2">
      <BentoCard {...upNext} variant="hero" />
      <BentoCard {...recovery} variant="warm" />
      <BentoCard {...nextDeadline} variant="cool" />
    </div>
  );
}
