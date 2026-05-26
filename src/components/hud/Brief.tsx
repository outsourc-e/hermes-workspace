import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface BriefProps {
  text: string;
  subtitle: string;
  onRegen?: () => void;
  regenLoading?: boolean;
}

export function Brief({ text, subtitle, onRegen, regenLoading }: BriefProps) {
  return (
    <div>
      <div className="text-[8px] text-[#8b949e] tracking-[2px] mb-1.5 flex justify-between items-center">
        <span>{subtitle}</span>
        {onRegen && (
          <button
            onClick={onRegen}
            disabled={regenLoading}
            className="text-[#58a6ff] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {regenLoading ? '… regenerating' : '↻ regen'}
          </button>
        )}
      </div>
      <div className="font-serif text-[13px] leading-relaxed text-[#e6edf3] prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-[15px] [&>h2]:text-[14px] [&>h3]:text-[13px] [&_strong]:text-[#c4b5fd]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}
