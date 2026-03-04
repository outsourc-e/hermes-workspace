import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import type { DashboardData } from '../hooks/use-dashboard-data'

type UsageTrendChartProps = {
  data: DashboardData
  className?: string
}

type ViewMode = 'tokens' | 'cost'

function formatTokenAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function formatCostAxis(value: number): string {
  if (value >= 1) return `$${value.toFixed(0)}`
  if (value >= 0.01) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTooltipTokens(value: number): string {
  return value.toLocaleString()
}

function formatTooltipCost(value: number): string {
  return `$${value.toFixed(4)}`
}

export function UsageTrendChart({ data, className }: UsageTrendChartProps) {
  const [view, setView] = useState<ViewMode>('tokens')
  const tokensByDay = data.timeseries.tokensByDay

  const chartData = useMemo(() => {
    if (!tokensByDay || tokensByDay.length === 0) return []
    return tokensByDay.map((entry) => ({
      date: formatDateLabel(entry.date),
      rawDate: entry.date,
      input: entry.input,
      output: entry.output,
      cacheRead: entry.cacheRead,
      cost: entry.cost,
    }))
  }, [tokensByDay])

  if (chartData.length === 0) {
    return (
      <div className={cn('rounded-2xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-5', className)}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary-900 dark:text-white">Usage Trend</h3>
        </div>
        <div className="flex h-[200px] items-center justify-center text-sm text-neutral-400">
          No usage data yet
        </div>
      </div>
    )
  }

  const isTokenView = view === 'tokens'

  return (
    <div className={cn('rounded-2xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-5', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary-900 dark:text-white">Usage Trend</h3>
        <div className="flex items-center gap-1 rounded-lg border border-primary-200 dark:border-neutral-700 p-0.5">
          <button
            type="button"
            onClick={() => setView('tokens')}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              view === 'tokens'
                ? 'bg-primary-100 dark:bg-neutral-700 text-primary-900 dark:text-white'
                : 'text-neutral-500 hover:text-primary-700 dark:hover:text-neutral-300',
            )}
          >
            Tokens
          </button>
          <button
            type="button"
            onClick={() => setView('cost')}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              view === 'cost'
                ? 'bg-primary-100 dark:bg-neutral-700 text-primary-900 dark:text-white'
                : 'text-neutral-500 hover:text-primary-700 dark:hover:text-neutral-300',
            )}
          >
            Cost
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-[10px] text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
          Input
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
          Output
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 opacity-60" />
          Cache Read
        </span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCache" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200, #e5e7eb)" opacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--color-neutral-500, #6b7280)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={isTokenView ? formatTokenAxis : formatCostAxis}
            tick={{ fontSize: 10, fill: 'var(--color-neutral-500, #6b7280)' }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-neutral-900, #1a1a2e)',
              border: '1px solid var(--color-neutral-700, #374151)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '11px',
            }}
            formatter={(value: number, name: string) => {
              const label = name === 'input' ? 'Input' : name === 'output' ? 'Output' : 'Cache Read'
              const formatted = isTokenView ? formatTooltipTokens(value) : formatTooltipCost(value)
              return [formatted, label]
            }}
          />
          {isTokenView ? (
            <>
              <Area
                type="monotone"
                dataKey="cacheRead"
                stackId="tokens"
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                fill="url(#gradCache)"
              />
              <Area
                type="monotone"
                dataKey="input"
                stackId="tokens"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#gradInput)"
              />
              <Area
                type="monotone"
                dataKey="output"
                stackId="tokens"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#gradOutput)"
              />
            </>
          ) : (
            <Area
              type="monotone"
              dataKey="cost"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#gradInput)"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
