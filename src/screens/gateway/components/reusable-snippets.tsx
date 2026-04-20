import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export type SnippetProps = {
  snippets: Array<{
    id: string
    title: string
    content: string
    tags: string[]
    usageCount: number
  }>
  onUseSnippet: (snippetId: string) => void
}

function previewText(content: string): string {
  if (content.length <= 100) return content
  return `${content.slice(0, 100).trimEnd()}...`
}

export function ReusableSnippets({ snippets, onUseSnippet }: SnippetProps) {
  const [query, setQuery] = useState('')

  const filteredSnippets = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return snippets

    return snippets.filter((snippet) => {
      const haystack = `${snippet.title}\n${snippet.content}\n${snippet.tags.join(' ')}`.toLowerCase()
      return haystack.includes(trimmed)
    })
  }, [query, snippets])

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-2xl border border-primary-800 bg-primary-950 p-4">
      <div className="mb-3">
        <label className="sr-only" htmlFor="snippet-search">
          Search snippets
        </label>
        <input
          id="snippet-search"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search snippets by title, content, or tag..."
          className="h-10 w-full rounded-lg border border-primary-700 bg-primary-900 px-3 text-sm text-primary-100 placeholder:text-primary-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredSnippets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary-800 bg-primary-900/60 px-4 py-8 text-center text-sm text-primary-300">
            No snippets match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredSnippets.map((snippet) => (
              <article
                key={snippet.id}
                className="flex h-full flex-col rounded-xl border border-primary-800 bg-primary-900/50 p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold text-primary-100">
                    {snippet.title}
                  </h3>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border border-primary-700 bg-primary-900 px-2 py-0.5 text-[10px] font-medium text-primary-300',
                    )}
                  >
                    {snippet.usageCount} uses
                  </span>
                </div>

                <p className="mb-3 line-clamp-3 text-xs text-primary-300">
                  {previewText(snippet.content)}
                </p>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {snippet.tags.map((tag) => (
                    <span
                      key={`${snippet.id}-${tag}`}
                      className="rounded-full border border-primary-700 bg-primary-900 px-2 py-0.5 text-[10px] font-medium text-primary-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onUseSnippet(snippet.id)}
                  className="mt-auto h-9 rounded-lg bg-accent-500 px-3 text-xs font-semibold text-primary-950 transition-colors hover:bg-accent-400"
                >
                  Use
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
