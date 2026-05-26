import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useHUDSnapshot } from '../components/hud/hooks/useHUDSnapshot';
import { useHUDConfig, useHUDConfigPatch } from '../components/hud/hooks/useHUDConfig';

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

interface TodayResponse { events: CalendarEventLite[] }
interface WeekResponse { events: CalendarEventLite[] }

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

interface DeadlinesResponse { deadlines: Deadline[]; semester_name: string }

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
  recommendation?: { activity: string; reason: string };
}

interface InboxItemData {
  id: string;
  severity: 'urgent' | 'warn' | 'ok' | 'info' | 'dim';
  tag: string;
  body: string;
  when: string;
  href?: string;
}

// ── Theme tokens ──────────────────────────────────────────────────────────
//
// Praxentis brand: deep navy + purple. ONE accent (purple) is reserved for
// "Hermes is talking to you" — interactive UI, key headings, the brand chip.
// Everything else lives on the slate scale.

const ACCENT = '#7A5CFF'; // Praxentis purple
const ACCENT_LIGHT = '#B191FF';
const FONT_STACK = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const TZ = 'Australia/Adelaide';

// ── Helpers ───────────────────────────────────────────────────────────────

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

function firstActionFromBrief(briefText: string | undefined): string | null {
  if (!briefText) return null;
  const lines = briefText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstAction = lines.findIndex((l) => /^\*?\*?first action/i.test(l));
  if (firstAction >= 0 && firstAction + 1 < lines.length) {
    return lines[firstAction + 1].replace(/^[-*]\s+/, '').replace(/[*_`]/g, '').trim();
  }
  return null;
}

/** Map every feed category to a single-letter glyph. The eye doesn't need
 * to learn 5 colour codes — one letter + neutral slate is faster to scan. */
function categoryGlyph(category: string): { letter: string; full: string } {
  const c = category.toLowerCase();
  if (c === 'uni' || c === 'university' || c === 'study') return { letter: 'U', full: 'University' };
  if (c === 'clinic' || c === 'tadc' || c === 'hcc') return { letter: 'C', full: 'Clinic' };
  if (c === 'family') return { letter: 'F', full: 'Family' };
  if (c === 'work' || c === 'project' || c === 'projects' || c === 'praxentis') return { letter: 'W', full: 'Work' };
  return { letter: 'L', full: 'Life' };
}

function isToday(iso: string, now: Date): boolean {
  const d = new Date(iso);
  const localDate = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return localDate.format(d) === localDate.format(now);
}

function isTomorrow(iso: string, now: Date): boolean {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const d = new Date(iso);
  const localDate = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return localDate.format(d) === localDate.format(tomorrow);
}

// ── Primitives ────────────────────────────────────────────────────────────

function Card({
  title,
  children,
  className = '',
  action,
  emphasis = false,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  emphasis?: boolean;
}) {
  const borderColor = emphasis ? `rgba(122,92,255,0.35)` : 'rgba(122,92,255,0.12)';
  return (
    <section
      className={`rounded-xl border bg-[#0a0f1d]/80 backdrop-blur-sm ${className}`}
      style={{ borderColor }}
    >
      {title && (
        <header
          className="flex items-center justify-between px-5 pt-4 pb-3 border-b"
          style={{ borderColor: 'rgba(122,92,255,0.10)' }}
        >
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-300">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function CategoryGlyph({ category }: { category: string }) {
  const g = categoryGlyph(category);
  return (
    <span
      title={g.full}
      className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold tabular-nums bg-slate-800/60 border border-slate-700/60 text-slate-300"
    >
      {g.letter}
    </span>
  );
}

function EventRow({ ev }: { ev: CalendarEventLite }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-900/40 transition-colors">
      <div className="flex-shrink-0 w-14 text-right">
        <div className="text-sm font-semibold tabular-nums" style={{ color: ACCENT_LIGHT, fontFamily: "'JetBrains Mono', monospace" }}>
          {ev.is_all_day ? 'ALL' : formatTime(ev.start)}
        </div>
        {!ev.is_all_day && (
          <div className="text-[10px] text-slate-500 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            → {formatTime(ev.end)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <CategoryGlyph category={ev.category} />
          <span className="text-sm font-medium text-slate-100 truncate">{ev.summary}</span>
        </div>
        {ev.location && <div className="text-[11px] text-slate-500 truncate pl-7">{ev.location}</div>}
      </div>
    </li>
  );
}

function DeadlineRow({ d }: { d: Deadline }) {
  let pillClass: string;
  let pillText: string;
  if (d.days_away < 0) {
    pillClass = 'text-slate-500 border-slate-700/50 bg-slate-800/30';
    pillText = 'PASSED';
  } else if (d.days_away === 0) {
    pillClass = 'text-rose-200 border-rose-500/50 bg-rose-500/15';
    pillText = 'TODAY';
  } else if (d.days_away === 1) {
    pillClass = 'text-amber-200 border-amber-500/50 bg-amber-500/15';
    pillText = 'TOMORROW';
  } else if (d.days_away <= 7) {
    pillClass = 'text-amber-200 border-amber-500/30 bg-amber-500/10';
    pillText = `${d.days_away} DAYS`;
  } else {
    pillClass = 'text-slate-300 border-slate-600/30 bg-slate-700/20';
    pillText = `${d.days_away} DAYS`;
  }

  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-900/40 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-100 truncate">
          <span className="font-semibold mr-1.5" style={{ color: ACCENT_LIGHT }}>{d.unit}</span>
          {d.assessment}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {d.type}
          {d.is_hurdle && <span className="ml-2 text-rose-300">· Hurdle</span>}
          {!d.is_hurdle && d.weight && <span className="ml-2">· {d.weight}</span>}
        </div>
      </div>
      <span className={`flex-shrink-0 text-[10px] font-bold tracking-wider px-2 py-1 rounded border uppercase ${pillClass}`}>
        {pillText}
      </span>
    </li>
  );
}

function MissionObjectiveRow({
  item,
  onDismiss,
  dismissPending,
}: {
  item: InboxItemData;
  onDismiss: (id: string) => void;
  dismissPending: boolean;
}) {
  const tone =
    item.severity === 'urgent' ? 'border-l-rose-400' :
    item.severity === 'warn' ? 'border-l-amber-400' :
    item.severity === 'info' ? 'border-l-[#B191FF]' :
    'border-l-slate-600';
  return (
    <li className={`group flex items-center gap-3 pl-3 pr-2 py-2.5 border-l-2 ${tone} bg-slate-900/30 rounded-r-lg`}>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 font-semibold">{item.tag}</div>
        <div className="text-sm text-slate-100">{item.body}</div>
      </div>
      <div className="text-[10px] text-slate-500 whitespace-nowrap mr-1">{item.when}</div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        disabled={dismissPending}
        className="opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-emerald-300 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-emerald-500/10"
        aria-label={`Mark "${item.body}" as done`}
        title="Mark done"
      >
        ✓
      </button>
    </li>
  );
}

function StatTile({
  label, value, sub, tone = 'neutral',
}: {
  label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const valueColor =
    tone === 'good' ? 'text-emerald-300' :
    tone === 'warn' ? 'text-amber-300' :
    tone === 'bad' ? 'text-rose-300' :
    'text-slate-100';
  return (
    <div className="rounded-lg border bg-slate-900/40 px-4 py-3" style={{ borderColor: 'rgba(122,92,255,0.10)' }}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueColor}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      to={href}
      className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
      style={{ borderColor: 'rgba(122,92,255,0.12)' }}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] font-medium text-slate-300 tracking-wide">{label}</span>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function DashboardPage() {
  const { data: snapshot } = useHUDSnapshot();
  const { data: cfg } = useHUDConfig();
  const patchConfig = useHUDConfigPatch();

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
  const weekQuery = useQuery<WeekResponse>({
    queryKey: ['calendar', 'week'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/week');
      if (!res.ok) throw new Error('week fetch failed');
      return res.json();
    },
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
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

  // Tomorrow events derived from the week list — saves a separate endpoint
  // and gives us the full ranked list (the snapshot's tomorrow widget is
  // single-line summary only).
  const tomorrowEvents = useMemo(() => {
    const evs = weekQuery.data?.events ?? [];
    return evs.filter((e) => isTomorrow(e.start, now))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [weekQuery.data, now]);

  const deadlines = useMemo(() => (deadlinesQuery.data?.deadlines ?? []).slice(0, 5), [deadlinesQuery.data]);

  const recoveryPct = recovery?.details?.recovery_pct ?? 0;
  const recoveryTone: 'good' | 'warn' | 'bad' = recoveryPct >= 67 ? 'good' : recoveryPct >= 34 ? 'warn' : 'bad';
  const rec = recovery?.recommendation;

  const handleDismiss = (id: string) => {
    const next = { ...(cfg?.dismissed_inbox_items ?? {}), [id]: Date.now() + ONE_DAY_MS };
    patchConfig.mutate({ dismissed_inbox_items: next });
  };

  const hour = formatTime(now.toISOString());

  // Show only first 3 tomorrow events with "+N more" link
  const TOMORROW_CAP = 3;
  const tomorrowVisible = tomorrowEvents.slice(0, TOMORROW_CAP);
  const tomorrowOverflow = Math.max(0, tomorrowEvents.length - TOMORROW_CAP);

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{
        fontFamily: FONT_STACK,
        background: '#050810',
      }}
    >
      {/* One static purple wash at the top — no animations */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(122,92,255,0.10) 0%, transparent 65%)',
        }}
      />

      <main className="relative max-w-4xl mx-auto px-6 py-8 space-y-5">
        {/* Slim header strip — brand on left, clock on right */}
        <header className="flex items-center justify-between text-[11px] tracking-[0.18em] uppercase text-slate-500 pb-2">
          <span className="font-semibold" style={{ color: ACCENT_LIGHT }}>Hermes Workspace</span>
          <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {dateLabel.toUpperCase()} · {hour} ACST
          </span>
        </header>

        {/* Greeting — smaller, secondary now */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {greeting}, Nick
          </h1>
        </div>

        {/* HERO: First action + Body recommendation — the prescriptive zone */}
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
          {firstAction ? (
            <Card emphasis>
              <div className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: ACCENT_LIGHT }}>
                First action
              </div>
              <p className="text-lg leading-snug text-slate-50 font-medium">{firstAction}</p>
            </Card>
          ) : (
            <Card>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-semibold mb-2">First action</div>
              <p className="text-sm text-slate-500">No brief available yet — regen the morning brief to set today's lead action.</p>
            </Card>
          )}
          {rec ? (
            <Card emphasis>
              <div className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: ACCENT_LIGHT }}>
                Body says
              </div>
              <p className="text-lg font-semibold text-slate-50">{rec.activity}</p>
              <p className="text-[12px] text-slate-400 mt-1">{rec.reason}</p>
            </Card>
          ) : (
            <Card>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-semibold mb-2">Body says</div>
              <p className="text-sm text-slate-500">No WHOOP data yet today.</p>
            </Card>
          )}
        </div>

        {/* Today */}
        <Card
          title="Today"
          action={<span className="text-[10px] text-slate-500">{todayEvents.length} event{todayEvents.length === 1 ? '' : 's'}</span>}
        >
          {todayQuery.isLoading && <div className="text-sm text-slate-500 py-2">Loading calendar…</div>}
          {!todayQuery.isLoading && todayEvents.length === 0 && (
            <div className="text-sm text-slate-500 py-4 text-center">No events scheduled today</div>
          )}
          <ul className="space-y-0.5">
            {todayEvents.map((ev) => <EventRow key={ev.id} ev={ev} />)}
          </ul>
        </Card>

        {/* Tomorrow — same EventRow as Today, capped */}
        <Card
          title="Tomorrow"
          action={<span className="text-[10px] text-slate-500">{tomorrowEvents.length} event{tomorrowEvents.length === 1 ? '' : 's'}</span>}
        >
          {weekQuery.isLoading && <div className="text-sm text-slate-500 py-2">Loading…</div>}
          {!weekQuery.isLoading && tomorrowVisible.length === 0 && (
            <div className="text-sm text-slate-500 py-4 text-center">Nothing scheduled</div>
          )}
          <ul className="space-y-0.5">
            {tomorrowVisible.map((ev) => <EventRow key={ev.id} ev={ev} />)}
          </ul>
          {tomorrowOverflow > 0 && (
            <div className="pt-2 pl-3 text-[11px] text-slate-500">
              + {tomorrowOverflow} more
            </div>
          )}
        </Card>

        {/* Deadlines */}
        {deadlines.length > 0 && (
          <Card
            title="Deadlines"
            action={<span className="text-[10px] text-slate-500">{deadlinesQuery.data?.semester_name}</span>}
          >
            <ul className="space-y-0.5">
              {deadlines.map((d) => <DeadlineRow key={d.id} d={d} />)}
            </ul>
          </Card>
        )}

        {/* Status — 3 numeric tiles (recommended moved up to hero) */}
        <Card title="Status">
          <div className="grid grid-cols-3 gap-3">
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
          </div>
        </Card>

        {/* Mission Objectives — interactive: ✓ done dismisses for 24h */}
        {inboxItems.length > 0 && (
          <Card
            title="Mission Objectives"
            action={
              <span className="text-[10px] text-slate-500">
                {inboxItems.length} active
                {patchConfig.isPending && <span className="ml-2 text-slate-400">· saving…</span>}
              </span>
            }
          >
            <ul className="space-y-2">
              {inboxItems.map((item) => (
                <MissionObjectiveRow
                  key={item.id}
                  item={item}
                  onDismiss={handleDismiss}
                  dismissPending={patchConfig.isPending}
                />
              ))}
            </ul>
          </Card>
        )}

        {/* Quick Access */}
        <Card title="Quick Access">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickAction href="/chat" icon="💬" label="Chat" />
            <QuickAction href="/files" icon="📁" label="Files" />
            <QuickAction href="/uni/obsidian" icon="📚" label="Obsidian" />
            <QuickAction href="/uni/calendar" icon="🗓️" label="Calendar" />
          </div>
        </Card>

        <footer className="text-center text-[10px] text-slate-700 tracking-[0.2em] uppercase pt-4 pb-2">
          Powered by Hermes
        </footer>
      </main>
    </div>
  );
}
