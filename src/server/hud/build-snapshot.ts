/**
 * Shared HUD snapshot construction — called by both /api/hud/snapshot
 * (polling fallback / initial render) and /api/hud/stream (SSE live
 * updates). Pulling this out of the route module so the SSE heartbeat
 * loop can re-run it cheaply on a timer.
 *
 * Side-effect imports register every source adapter into the global
 * registry — keep the list in sync with src/routes/api/hud/snapshot.ts.
 */
import { loadHUDConfig } from '../../lib/hud/config'
import { runAggregator } from './aggregator'
import { adapterRegistry } from './sources'
import { HUDCache } from './cache'
import { buildInboxFeed } from './severity'
import type { HUDSnapshot } from './types'
import type { InboxItemData } from '../../components/hud/InboxItem'

import '../../server/hud/sources/vm-health'
import '../../server/hud/sources/errors'
import '../../server/hud/sources/jobs'
import '../../server/hud/sources/agents'
import '../../server/hud/sources/sms'
import '../../server/hud/sources/telegram'
import '../../server/hud/sources/cliniko-today'
import '../../server/hud/sources/plaud'
import '../../server/hud/sources/google-calendar'
import '../../server/hud/sources/brief'
import '../../server/hud/sources/whoop'
import '../../server/hud/sources/sessions'
import '../../server/hud/sources/pr-ci'
import '../../server/hud/sources/uni-deadlines'
import '../../server/hud/sources/calendar-feeds-health'
import '../../server/hud/sources/tomorrow'

const cache = new HUDCache()

export async function buildHUDSnapshot(): Promise<HUDSnapshot> {
  const snap = await runAggregator(adapterRegistry, { deadlineMs: 1500, cache })
  const cfg = await loadHUDConfig()

  // Fan out CalendarData into a separate up-next widget snapshot
  const calWidget = snap.widgets['timeline']
  if (calWidget.state === 'loaded' && calWidget.data) {
    const d = calWidget.data as any
    snap.widgets['up-next'] = {
      id: 'up-next',
      state: d.upNext ? 'loaded' : 'loading',
      data: d.upNext,
      fetchedAt: calWidget.fetchedAt,
      ttlMs: calWidget.ttlMs,
    }
  }

  // Build inbox feed from contributing sources
  const items: Array<InboxItemData> = []

  // Derive GitHub URLs for PR / CI inbox items from the same env the
  // pr-ci adapter reads. Defaults match pr-ci.ts.
  const firstRepo = (
    process.env.HUD_TRACKED_REPOS || 'SPACEMAN1898/CliniTrack-Suite'
  )
    .split(',')[0]
    .trim()
  const prsHref = `https://github.com/${firstRepo}/pulls?q=is%3Aopen+is%3Apr+review-requested%3A%40me`
  const ciHref = `https://github.com/${firstRepo}/actions?query=is%3Afailure`

  // Calendar urgents
  const cal = snap.widgets['timeline']
  const urgents = (cal.data as any)?.urgentItems ?? []
  items.push(...urgents)

  // PLAUD untranscribed
  const plaud = snap.widgets['plaud']
  const plaudCount = Number((plaud.data as any)?.value)
  if (plaud.state === 'loaded' && plaudCount > 0) {
    items.push({
      id: 'plaud-untranscribed',
      severity: plaudCount >= 10 ? 'warn' : 'info',
      tag: 'PLAUD',
      body: `${plaudCount} untranscribed recording${plaudCount === 1 ? '' : 's'}`,
      when: 'now',
      href: 'https://app.plaud.ai/',
    })
  }

  // PRs needing review
  const prs = snap.widgets['prs']
  if (
    prs.state === 'loaded' &&
    /need review/i.test((prs.data as any)?.sub ?? '')
  ) {
    items.push({
      id: 'prs-review-needed',
      severity: 'info',
      tag: 'PR',
      body: (prs.data as any).sub,
      when: 'now',
      href: prsHref,
    })
  }

  // Job failures
  const jobs = snap.widgets['jobs']
  if (jobs.state === 'loaded' && /fail/.test((jobs.data as any)?.sub ?? '')) {
    items.push({
      id: 'jobs-failed',
      severity: 'warn',
      tag: 'JOB',
      body: (jobs.data as any).sub + ' in last 24h',
      when: 'today',
      href: '/operations',
    })
  }

  // Recent errors
  const errors = snap.widgets['errors']
  const errorCount = Number((errors.data as any)?.value)
  if (errors.state === 'loaded' && errorCount > 0) {
    items.push({
      id: 'errors-recent',
      severity: errorCount >= 5 ? 'urgent' : 'warn',
      tag: 'ERROR',
      body: `${errorCount} error${errorCount === 1 ? '' : 's'} in the last hour`,
      when: 'now',
      // TODO: replace with an agent-spawn flow that opens a Claude window
      // with the error context + fix suggestions. For now route to /files.
      href: '/files',
    })
  }

  // Cliniko appointments today
  const cliniko = snap.widgets['cliniko']
  const clinikoCount = Number((cliniko.data as any)?.value)
  if (cliniko.state === 'loaded' && clinikoCount > 0) {
    items.push({
      id: 'cliniko-today',
      severity: 'info',
      tag: 'CLINIC',
      body: `${clinikoCount} appointment${clinikoCount === 1 ? '' : 's'} today`,
      when: 'today',
      href: '/dashboard#work',
    })
  }

  // CI failures
  const ci = snap.widgets['ci']
  const ciSub = String((ci.data as any)?.sub ?? '')
  if (ci.state === 'loaded' && /fail/i.test(ciSub)) {
    items.push({
      id: 'ci-failing',
      severity: 'warn',
      tag: 'CI',
      body: ciSub,
      when: 'now',
      href: ciHref,
    })
  }

  // VM health degradation
  const vm = snap.widgets['vm-health']
  if (vm.state === 'loaded' && (vm.data as any)?.tone === 'err') {
    items.push({
      id: 'vm-degraded',
      severity: 'urgent',
      tag: 'VM',
      body: `VM degraded: ${(vm.data as any).value} mem · ${(vm.data as any).sub}`,
      when: 'now',
      // TODO: dedicated VM-status section on /dashboard alongside agents/jobs.
      href: '/dashboard#system',
    })
  } else if (vm.state === 'loaded' && (vm.data as any)?.tone === 'warn') {
    items.push({
      id: 'vm-warn',
      severity: 'warn',
      tag: 'VM',
      body: `VM under pressure: ${(vm.data as any).value} mem · ${(vm.data as any).sub}`,
      when: 'now',
      href: '/dashboard#system',
    })
  }

  // Calendar feed health
  const calFeeds = snap.widgets['calendar-feeds']
  const calFeedsTone = String((calFeeds.data as any)?.tone ?? '')
  if (
    calFeeds.state === 'loaded' &&
    (calFeedsTone === 'err' || calFeedsTone === 'warn')
  ) {
    items.push({
      id: 'calendar-feeds-degraded',
      severity: calFeedsTone === 'err' ? 'warn' : 'info',
      tag: 'CAL',
      body: `Calendar feeds: ${(calFeeds.data as any).value} healthy · ${(calFeeds.data as any).sub}`,
      when: 'now',
      href: '/dashboard#calendar',
    })
  }

  // Uni deadlines — Obsidian source preferred; fallback to nextUniEvent from
  // the calendar pipeline so the bento Next-Deadline card still surfaces
  // something when the Obsidian file is empty.
  const uniWidget = snap.widgets['next-deadline']
  const calDataAny = cal.data as any
  let uniData: any = null
  if (uniWidget.state === 'loaded' && uniWidget.data) {
    uniData = uniWidget.data
  } else if (calDataAny?.nextUniEvent) {
    const ne = calDataAny.nextUniEvent
    const labelTime =
      ne.daysOut <= 0
        ? 'TODAY'
        : ne.daysOut === 1
          ? 'TOMORROW'
          : ne.daysOut + 'D'
    uniData = {
      label: 'UNI · ' + labelTime,
      title: ne.title,
      sub: ne.calendarName || 'uni',
    }
    snap.widgets['next-deadline'] = {
      id: 'next-deadline',
      state: 'loaded',
      data: uniData,
      fetchedAt: cal.fetchedAt,
      ttlMs: cal.ttlMs,
    }
  }
  if (uniData) {
    items.push({
      id: 'uni-' + uniData.title,
      severity:
        uniData.label.includes('TODAY') || uniData.label.includes('TOMORROW')
          ? 'urgent'
          : 'warn',
      tag: 'UNI',
      body: uniData.title + ' ' + uniData.sub,
      when: uniData.label.replace('UNI · ', ''),
      href: '/uni/calendar',
    })
  }

  snap.widgets['inbox'] = {
    id: 'inbox',
    state: 'loaded',
    data: buildInboxFeed(items, cfg) as any,
    fetchedAt: Date.now(),
    ttlMs: 60_000,
  }

  return snap
}
