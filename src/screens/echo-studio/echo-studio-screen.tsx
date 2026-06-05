import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tab = 'create' | 'manage' | 'theme'

const QUICK_TEMPLATES = [
  { id: 'analytics', label: 'Analytics Dashboard', icon: '</>' },
  { id: 'system', label: 'System Monitor', icon: '☰' },
  { id: 'chat', label: 'Chat Analytics', icon: '💬' },
]

const DEFAULT_PROMPT =
  "Describe the UI you want: charts, tables, KPIs, filters, real-time updates... Example: 'A dashboard with a line graph showing tool usage over time, a period selector (week/month), top 3 KPI cards for most used tools, a live counter for active calls, and a detailed table below with project, tool name, count, date, and status columns.'"

export function EchoStudioScreen() {
  const [tab, setTab] = useState<Tab>('create')
  const [pageId, setPageId] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [screensCreated, setScreensCreated] = useState(0)
  const [widgetsActive, setWidgetsActive] = useState(0)
  const [apiEndpoints, setApiEndpoints] = useState(0)

  const handleCreate = async () => {
    if (!pageId.trim() || !pageTitle.trim() || !prompt.trim()) return
    setCreating(true)
    // Simulate creation — in production this would call the backend
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setScreensCreated((c) => c + 1)
    setApiEndpoints((c) => c + 1)
    setPageId('')
    setPageTitle('')
    setPrompt('')
    setCreating(false)
  }

  const handleTemplate = (id: string) => {
    const templates: Record<string, { id: string; title: string; prompt: string }> = {
      analytics: {
        id: 'tool-analytics',
        title: 'Tool Analytics',
        prompt:
          'A dashboard with a line graph showing tool usage over time, a period selector (week/month), top 3 KPI cards for most used tools, a live counter for active calls, and a detailed table below with project, tool name, count, date, and status columns.',
      },
      system: {
        id: 'system-monitor',
        title: 'System Monitor',
        prompt:
          'A system monitoring dashboard with CPU/RAM/Disk gauges, a real-time process list, uptime counter, and alert history table. Include a dark theme and auto-refresh every 30 seconds.',
      },
      chat: {
        id: 'chat-analytics',
        title: 'Chat Analytics',
        prompt:
          'A chat analytics dashboard showing messages per day as a bar chart, top users table, average response time trend, sentiment breakdown pie chart, and a searchable message log.',
      },
    }
    const t = templates[id]
    if (t) {
      setPageId(t.id)
      setPageTitle(t.title)
      setPrompt(t.prompt)
    }
  }

  return (
    <div className="min-h-full overflow-y-auto bg-surface text-ink">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Echo Studio</h1>
          <p className="mt-1 text-sm text-primary-500">
            Describe what you want. I'll build the full page with backend API.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border border-primary-200 bg-primary-50/85 p-1 backdrop-blur-xl">
          {(['create', 'manage', 'theme'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors',
                tab === t
                  ? 'bg-primary-100 text-ink shadow-sm dark:bg-neutral-800'
                  : 'text-primary-500 hover:text-ink',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Create Tab */}
        {tab === 'create' && (
          <div className="space-y-6">
            {/* Form */}
            <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-6">
              <div className="space-y-5">
                {/* Page ID */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-500">
                    Page ID (URL Slug)
                  </label>
                  <input
                    type="text"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    placeholder="e.g. tool-analytics"
                    className="w-full rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-primary-400 focus:border-accent-500 dark:bg-neutral-900"
                  />
                </div>

                {/* Page Title */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-500">
                    Page Title
                  </label>
                  <input
                    type="text"
                    value={pageTitle}
                    onChange={(e) => setPageTitle(e.target.value)}
                    placeholder="e.g. Tool Analytics"
                    className="w-full rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-primary-400 focus:border-accent-500 dark:bg-neutral-900"
                  />
                </div>

                {/* Prompt */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-500">
                    What should this page do?
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={DEFAULT_PROMPT}
                    rows={5}
                    className="w-full resize-y rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-primary-400 focus:border-accent-500 dark:bg-neutral-900"
                  />
                </div>

                {/* Create Button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!pageId.trim() || !pageTitle.trim() || !prompt.trim() || creating}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all',
                      creating || !pageId.trim() || !pageTitle.trim() || !prompt.trim()
                        ? 'cursor-not-allowed bg-primary-300 opacity-60'
                        : 'bg-accent-500 hover:bg-accent-600 active:scale-[0.98]',
                    )}
                  >
                    {creating ? (
                      <>
                        <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <span>✨</span>
                        Create Full Page + API
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Templates */}
            <div>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-500">
                Quick Templates
              </h2>
              <div className="flex flex-wrap gap-3">
                {QUICK_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTemplate(t.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent-500 hover:bg-accent-50/50 dark:hover:bg-accent-900/20"
                  >
                    <span className="text-base">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Screens Created" value={screensCreated} />
              <StatCard label="Widgets Active" value={widgetsActive} />
              <StatCard label="API Endpoints" value={apiEndpoints} />
            </div>
          </div>
        )}

        {/* Manage Tab */}
        {tab === 'manage' && (
          <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-8 text-center">
            <p className="text-lg text-primary-500">No screens created yet.</p>
            <p className="mt-1 text-sm text-primary-400">
              Use the Create tab to build your first dashboard.
            </p>
          </div>
        )}

        {/* Theme Tab */}
        {tab === 'theme' && (
          <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-8 text-center">
            <p className="text-lg text-primary-500">Theme customization coming soon.</p>
            <p className="mt-1 text-sm text-primary-400">
              Choose from light, dark, and custom color schemes for your dashboards.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
    </div>
  )
}