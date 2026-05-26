import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useHUDSnapshot } from '../components/hud/hooks/useHUDSnapshot';

export const Route = createFileRoute('/dashboard')({ component: DashboardPage, ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────

type WidgetMap = Record<string, { data?: unknown; state?: string }>;

interface CalendarEventLite {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  feed_name: string;
  category: string;
  is_all_day: boolean;
}

interface TodayResponse {
  events: CalendarEventLite[];
}

interface Deadline {
  id: string;
  assessment: string;
  unit: string;
  unit_name: string;
  date: string;
  type: string;
  is_hurdle: boolean;
  weight: string;
  days_away: number;
}

interface DeadlinesResponse {
  deadlines: Deadline[];
  semester_name: string;
}

interface RecoveryData {
  label?: string;
  title?: string;
  sub?: string;
  details?: {
    recovery_pct: number;
    hrv_ms: number;
    resting_hr_bpm: number;
    sleep_hours: number;
    sleep_performance_pct: number;
    day_strain: number;
  };
  recommendation?: {
    activity: string;
    reason: string;
  };
}

interface InboxItemData {
  id: string;
  severity: 'urgent' | 'warn' | 'ok' | 'info' | 'dim';
  tag: string;
  body: string;
  when: string;
  href?: string;
}

interface TomorrowData {
  label?: string;
  title?: string;
  sub?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TZ = 'Australia/Adelaide';

function getGreeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now),
  );
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Night shift';
}

function formatDate(now: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function calendarToken(category: string): { bg: string; border: string; text: string; label: string } {
  // Normalised across the user's feeds: personal → Life, family, uni, clinic, projects.
  const c = category.toLowerCase();
  if (c === 'uni' || c === 'university' || c === 'study') {
    return { bg: 'rgba(0,255,128,0.12)', border: 'rgba(0,255,128,0.45)', text: '#5cffb1', label: 'UNI' };
  }
  if (c === 'clinic' || c === 'tadc' || c === 'hcc') {
    return { bg: 'rgba(255,170,0,0.12)', border: 'rgba(255,170,0,0.45)', text: '#ffcb5c', label: 'CLINIC' };
  }
  if (c === 'family') {
    return { bg: 'rgba(157,0,255,0.14)', border: 'rgba(157,0,255,0.5)', text: '#c194ff', label: 'FAMILY' };
  }
  if (c === 'work' || c === 'project' || c === 'projects' || c === 'praxentis') {
    return { bg: 'rgba(255,0,128,0.12)', border: 'rgba(255,0,128,0.45)', text: '#ff77b5', label: 'WORK' };
  }
  return { bg: 'rgba(0,217,255,0.10)', border: 'rgba(0,217,255,0.4)', text: '#7ee0ff', label: 'LIFE' };
}

function firstActionFromBrief(briefText: string | undefined): string | null {
  if (!briefText) return null;
  const lines = briefText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstAction = lines.findIndex((l) => /^\*?\*?first action/i.test(l));
  if (firstAction >= 0 && firstAction + 1 < lines.length) {
    return lines[firstAction + 1].replace(/^[-*]\s+/, '').replace(/[*_`]/g, '').trim();
  }
  return null;
}

// ── Small primitives ──────────────────────────────────────────────────────

function Card({
  title,
  icon,
  children,
  className = '',
  action,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-cyan-500/20 bg-[#0d1320]/70 backdrop-blur-sm ${className}`}
    >
      <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-cyan-500/15">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-base">{icon}</span>}
          <h2 className="text-xs uppercase tracking-[0.2em] text-cyan-300 font-semibold">{title}</h2>
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const valueColor =
    tone === 'good' ? 'text-emerald-300' :
    tone === 'warn' ? 'text-amber-300' :
    tone === 'bad' ? 'text-rose-300' :
    'text-cyan-200';
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#0a1018]/60 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-medium">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function CalendarTag({ category }: { category: string }) {
  const t = calendarToken(category);
  return (
    <span
      className="inline-block text-[9px] font-semibold tracking-wider px-1.5 py-0.5 rounded uppercase"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text }}
    >
      {t.label}
    </span>
  );
}

function EventRow({ ev }: { ev: CalendarEventLite }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-cyan-500/20 hover:bg-cyan-500/5 transition-colors">
      <div className="flex-shrink-0 w-14 text-right">
        <div className="text-sm font-semibold text-cyan-300 tabular-nums">
          {ev.is_all_day ? 'ALL' : formatTime(ev.start)}
        </div>
        {!ev.is_all_day && (
          <div className="text-[10px] text-slate-500 tabular-nums">→ {formatTime(ev.end)}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-slate-100 truncate">{ev.summary}</span>
          <CalendarTag category={ev.category} />
        </div>
        {ev.location && (
          <div className="text-[11px] text-slate-500 truncate">{ev.location}</div>
        )}
      </div>
    </li>
  );
}

function DeadlineRow({ d }: { d: Deadline }) {
  const isUrgent = d.days_away <= 3 && d.days_away >= 0;
  const isSoon = d.days_away > 3 && d.days_away <= 7;
  const isPast = d.days_away < 0;
  const badge = isPast
    ? { text: 'PASSED', cls: 'text-slate-500 border-slate-700/50 bg-slate-800/30' }
    : d.days_away === 0
    ? { text: 'TODAY', cls: 'text-rose-300 border-rose-500/50 bg-rose-500/10' }
    : d.days_away === 1
    ? { text: 'TOMORROW', cls: 'text-orange-300 border-orange-500/50 bg-orange-500/10' }
    : isUrgent
    ? { text: `${d.days_away} DAYS`, cls: 'text-amber-300 border-amber-500/50 bg-amber-500/10' }
    : isSoon
    ? { text: `${d.days_away} DAYS`, cls: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/5' }
    : { text: `${d.days_away} DAYS`, cls: 'text-cyan-200 border-cyan-500/20 bg-cyan-500/5' };

  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-cyan-500/20 hover:bg-cyan-500/5 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-100 truncate">
          <span className="text-cyan-300 font-semibold mr-1.5">{d.unit}</span>
          {d.assessment}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {d.type}
          {d.is_hurdle && <span className="ml-2 text-rose-400">· Hurdle</span>}
          {!d.is_hurdle && d.weight && <span className="ml-2 text-slate-400">· {d.weight}</span>}
        </div>
      </div>
      <span
        className={`flex-shrink-0 inline-block text-[10px] font-bold tracking-wider px-2 py-1 rounded border uppercase ${badge.cls}`}
      >
        {badge.text}
      </span>
    </li>
  );
}

function InboxRow({ item }: { item: InboxItemData }) {
  const tone =
    item.severity === 'urgent' ? 'border-l-rose-500' :
    item.severity === 'warn' ? 'border-l-amber-500' :
    item.severity === 'info' ? 'border-l-cyan-500' :
    'border-l-slate-600';
  return (
    <li className={`px-3 py-2.5 border-l-2 ${tone} bg-[#0a1018]/50 rounded-r-lg flex items-center justify-between gap-3`}>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">{item.tag}</div>
        <div className="text-sm text-slate-100">{item.body}</div>
      </div>
      <div className="text-[10px] text-slate-500 whitespace-nowrap">{item.when}</div>
    </li>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      to={href}
      className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border border-cyan-500/15 bg-[#0a1018]/60 hover:border-cyan-400/50 hover:bg-cyan-500/10 transition-colors"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] font-medium text-slate-300 tracking-wide">{label}</span>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { data: snapshot } = useHUDSnapshot();
  const todayQuery = useQuery<TodayResponse>({
    queryKey: ['calendar', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/today');
      if (!res.ok) throw new Error('today fetch failed');
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const deadlinesQuery = useQuery<DeadlinesResponse>({
    queryKey: ['calendar', 'deadlines'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/deadlines');
      if (!res.ok) throw new Error('deadlines fetch failed');
      return res.json();
    },
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const widgets = (snapshot?.widgets ?? {}) as WidgetMap;
  const recovery = widgets['recovery']?.data as RecoveryData | undefined;
  const tomorrow = widgets['tomorrow']?.data as TomorrowData | undefined;
  const inboxItems = (widgets['inbox']?.data ?? []) as InboxItemData[];
  const briefText = (widgets['brief']?.data as { text?: string } | undefined)?.text;

  const now = useMemo(() => new Date(), [Math.floor(Date.now() / 60_000)]);
  const greeting = getGreeting(now);
  const dateLabel = formatDate(now);
  const firstAction = useMemo(() => firstActionFromBrief(briefText), [briefText]);

  const todayEvents = useMemo(() => {
    const evs = todayQuery.data?.events ?? [];
    return [...evs].sort((a, b) => a.start.localeCompare(b.start));
  }, [todayQuery.data]);

  const deadlines = useMemo(() => {
    return (deadlinesQuery.data?.deadlines ?? []).slice(0, 5);
  }, [deadlinesQuery.data]);

  // Recovery tone for stat colour.
  const recoveryPct = recovery?.details?.recovery_pct ?? 0;
  const recoveryTone: 'good' | 'warn' | 'bad' = recoveryPct >= 67 ? 'good' : recoveryPct >= 34 ? 'warn' : 'bad';

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100">
      {/* Subtle radial glow — no animations, no scanlines */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,217,255,0.06) 0%, transparent 60%)',
        }}
      />

      <main className="relative max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Greeting */}
        <header className="flex items-end justify-between gap-4 pb-2 border-b border-cyan-500/15">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
              {greeting}, <span className="text-cyan-300">Nick</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">{dateLabel}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono tabular-nums text-cyan-200">
              {now.toLocaleTimeString('en-AU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <div className="text-[10px] text-slate-500 tracking-widest uppercase mt-0.5">ACST</div>
          </div>
        </header>

        {/* First action callout */}
        {firstAction && (
          <section className="rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300 mb-1.5 font-semibold">
              First action
            </div>
            <p className="text-base text-slate-100">{firstAction}</p>
          </section>
        )}

        {/* Today + Tomorrow column */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
          <Card title="Today's Schedule" icon="📅" action={<span className="text-[10px] text-slate-500">{todayEvents.length} events</span>}>
            {todayQuery.isLoading && <div className="text-sm text-slate-500">Loading calendar…</div>}
            {!todayQuery.isLoading && todayEvents.length === 0 && (
              <div className="text-sm text-slate-500 py-6 text-center">No events scheduled today</div>
            )}
            <ul className="space-y-1">
              {todayEvents.map((ev) => <EventRow key={ev.id} ev={ev} />)}
            </ul>
          </Card>

          <Card title="Tomorrow" icon="🌅">
            {tomorrow && tomorrow.title && tomorrow.title !== 'Nothing scheduled' ? (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">{tomorrow.label}</div>
                <div className="text-base font-medium text-slate-100">{tomorrow.title}</div>
                {tomorrow.sub && <div className="text-[12px] text-slate-500">{tomorrow.sub}</div>}
              </div>
            ) : (
              <div className="text-sm text-slate-500 text-center py-4">Nothing scheduled</div>
            )}
          </Card>
        </div>

        {/* Deadlines */}
        {deadlines.length > 0 && (
          <Card title="Academic Deadlines" icon="📚" action={<span className="text-[10px] text-slate-500">{deadlinesQuery.data?.semester_name}</span>}>
            <ul className="space-y-1">
              {deadlines.map((d) => <DeadlineRow key={d.id} d={d} />)}
            </ul>
          </Card>
        )}

        {/* Status — Recovery / Strain / Sleep / Activity recommendation */}
        <Card title="Status" icon="📊">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Recovery"
              value={`${Math.round(recoveryPct)}%`}
              sub={recovery?.details ? `HRV ${Math.round(recovery.details.hrv_ms)} · RHR ${Math.round(recovery.details.resting_hr_bpm)}` : undefined}
              tone={recoveryTone}
            />
            <StatTile
              label="Day Strain"
              value={recovery?.details?.day_strain.toFixed(1) ?? '—'}
              sub="Yesterday"
            />
            <StatTile
              label="Sleep"
              value={recovery?.details?.sleep_hours ? `${recovery.details.sleep_hours.toFixed(1)}h` : '—'}
              sub={recovery?.details?.sleep_performance_pct ? `${Math.round(recovery.details.sleep_performance_pct)}% performance` : undefined}
            />
            <StatTile
              label="Recommended"
              value={recovery?.recommendation?.activity ?? '—'}
              sub={recovery?.recommendation?.reason ?? undefined}
              tone={recovery?.recommendation?.activity === 'Gym' ? 'good' :
                    recovery?.recommendation?.activity === 'Walk' ? 'warn' :
                    recovery?.recommendation?.activity === 'Rest' || recovery?.recommendation?.activity === 'Yoga' ? 'bad' :
                    'neutral'}
            />
          </div>
        </Card>

        {/* Mission Objectives — repurposed inbox */}
        {inboxItems.length > 0 && (
          <Card title="Mission Objectives" icon="✅" action={<span className="text-[10px] text-slate-500">{inboxItems.length} item{inboxItems.length === 1 ? '' : 's'}</span>}>
            <ul className="space-y-2">
              {inboxItems.map((item) => <InboxRow key={item.id} item={item} />)}
            </ul>
          </Card>
        )}

        {/* Quick Access */}
        <Card title="Quick Access" icon="⚡">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickAction href="/chat" icon="💬" label="Chat" />
            <QuickAction href="/files" icon="📁" label="Files" />
            <QuickAction href="/uni/obsidian" icon="📚" label="Obsidian" />
            <QuickAction href="/uni/calendar" icon="🗓️" label="Calendar" />
          </div>
        </Card>

        <footer className="text-center text-[10px] text-slate-600 tracking-widest uppercase pt-4 pb-2">
          Hermes Workspace · Morning Dashboard
        </footer>
      </main>
    </div>
  );
}
