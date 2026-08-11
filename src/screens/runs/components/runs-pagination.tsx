
import { RUNS_PAGE_SIZES  } from '../runs-search'
import { formatCount } from '../runs-format'
import type {RunsPageSize} from '../runs-search';
import type { RunsPageInfo } from '../use-runs-inventory'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  page: RunsPageInfo
  size: RunsPageSize
  busy: boolean
  onPage: (page: number) => void
  onSize: (size: RunsPageSize) => void
}

export function RunsPagination({ page, size, busy, onPage, onSize }: Props) {
  return (
    <nav aria-label="Run pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2">
      <p className="text-xs text-primary-600">
        Page {formatCount(page.number)} of {formatCount(page.pages)} · {formatCount(page.total)} matched
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-primary-600" htmlFor="runs-page-size">
          Per page
          <select
            id="runs-page-size"
            className="h-8 rounded-lg border border-primary-200 bg-primary-50 px-2 text-sm text-primary-900"
            value={size}
            onChange={(event) => onSize(Number(event.target.value) as RunsPageSize)}
          >
            {RUNS_PAGE_SIZES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button
          type="button"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
          disabled={busy || !page.hasPrevious}
          onClick={() => onPage(page.number - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
          disabled={busy || !page.hasNext}
          onClick={() => onPage(page.number + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}
