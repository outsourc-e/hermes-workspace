import {
  WORKSPACE_KERNEL_LOCKED_ACTIONS,
  WORKSPACE_KERNEL_SAFETY,





  attachWorkspaceArtifact,
  blockWorkspaceRun,
  buildKernelAgentDisplayStates,
  completeWorkspaceRun,
  createWorkspaceAction,
  createWorkspaceRun,
  getWorkspaceBlueprintById,
  workspaceKernelTelemetryFromRun
} from '../../workspace-kernel'
import { loadWorkspaceKernelState, persistWorkspaceKernelRuns } from '../../workspace-kernel/store'
import {



  createBlockedEtsyLiveResearchRun,
  normalizeEtsyLiveResearchRequest,
  normalizeEtsyLiveResearchRun
} from '../living-v3/etsy-live-research'
import {  runControlledAgentOneShot } from './controlled-athena-runner'
import type {EtsyLiveCandidate, EtsyLiveResearchRequest, EtsyLiveResearchRun} from '../living-v3/etsy-live-research';
import type {WorkspaceArtifact, WorkspaceEvent, WorkspaceKernelPersistedState, WorkspaceKernelTelemetrySnapshot, WorkspaceRun} from '../../workspace-kernel';
import type {ControlledAgentRunResult} from './controlled-athena-runner';

export type EtsyLiveResearchRunner = (
  request: EtsyLiveResearchRequest,
  context: { runId: string; startedAtMs: number; cwd?: string },
) => Promise<unknown>

export type EtsyLiveScoutBackendResult = {
  ok: boolean
  liveRun: EtsyLiveResearchRun
  state: WorkspaceKernelPersistedState
  run: WorkspaceRun
  artifact: WorkspaceArtifact
  telemetry: WorkspaceKernelTelemetrySnapshot
  displayStates: ReturnType<typeof buildKernelAgentDisplayStates>
  safety: typeof WORKSPACE_KERNEL_SAFETY
  lockedActions: Array<string>
}

let testRunner: EtsyLiveResearchRunner | undefined

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'etsy-live'
}

function eventId(runId: string, type: WorkspaceEvent['type'], createdAtMs: number) {
  return `${runId}-${type.replace(/\./g, '-')}-${createdAtMs}`
}

function replaceRunId(run: WorkspaceRun, runId: string): WorkspaceRun {
  const oldRunId = run.runId
  return {
    ...run,
    runId,
    events: run.events.map((event) => ({
      ...event,
      runId,
      eventId: event.eventId.replace(oldRunId, runId),
    })),
  }
}

function liveRunId(nowMs: number) {
  return `etsy-live-scout-${nowMs.toString(36)}`
}

function candidateEvidenceIds(candidates: Array<EtsyLiveCandidate>) {
  return Array.from(new Set(candidates.flatMap((candidate) => candidate.evidenceIds))).slice(0, 40)
}

function candidateSourceRecordIds(candidates: Array<EtsyLiveCandidate>) {
  return Array.from(new Set(candidates.flatMap((candidate) => candidate.sourceUrls))).slice(0, 40)
}

function candidateMissingFields(candidates: Array<EtsyLiveCandidate>, fallback: Array<string> = []) {
  const missing = Array.from(new Set(candidates.flatMap((candidate) => candidate.missingEvidence))).slice(0, 40)
  return missing.length ? missing : fallback
}

function createKernelRun(request: EtsyLiveResearchRequest, runId: string, nowMs: number) {
  const blueprint = getWorkspaceBlueprintById('etsy-live-readonly-research-v1')
  if (!blueprint) throw new Error('Missing etsy-live-readonly-research-v1 blueprint.')
  const action = createWorkspaceAction({
    actionId: `etsy-live-research-${runId}`,
    createdAtMs: nowMs,
    source: 'ui',
    intent: 'live read-only product research',
    summary: `Live read-only product research: ${request.query}`,
    domain: 'etsy',
    riskClass: 'R2_EXTERNAL_READ',
    input: {
      text: request.query,
      payload: {
        mode: request.mode,
        maxCandidates: request.maxCandidates,
        sourceHints: request.sourceHints,
      },
    },
    requestedWorkerProfileId: 'controlled-scout-v2',
    preferredBlueprintId: blueprint.blueprintId,
    preferredRoomId: 'etsy-market-lab',
    preferredStationId: 'etsy-loki-product-hunt',
  }, nowMs)
  return replaceRunId(createWorkspaceRun(action, blueprint, nowMs), runId)
}

function appendRunStarted(run: WorkspaceRun, request: EtsyLiveResearchRequest, nowMs: number): WorkspaceRun {
  const event: WorkspaceEvent = {
    eventId: eventId(run.runId, 'run.started', nowMs),
    runId: run.runId,
    type: 'run.started',
    createdAtMs: nowMs,
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
    workerProfileId: 'controlled-scout-v2',
    message: `Live read-only scout requested for "${request.query}".`,
    payload: {
      localOnly: true,
      liveActionsAllowed: false,
      workerSpawnAllowed: false,
      mode: request.mode,
    },
  }
  return {
    ...run,
    status: 'running',
    stage: 'station_handoff',
    updatedAtMs: nowMs,
    events: [...run.events, event],
  }
}

function createLiveArtifact(run: WorkspaceRun, liveRun: EtsyLiveResearchRun, nowMs: number): WorkspaceArtifact {
  const completed = liveRun.status === 'completed'
  return {
    artifactId: `workspace-artifact-${nowMs}-live-product-candidate-packet-${slug(liveRun.runId)}`,
    runId: run.runId,
    kind: 'live-product-candidate-packet',
    label: completed ? 'Live read-only product candidates' : 'Live read-only scout blocker',
    summary: completed
      ? `${liveRun.candidates.length} live read-only candidate${liveRun.candidates.length === 1 ? '' : 's'} returned for ${liveRun.query}.`
      : `Live read-only scout blocked: ${liveRun.blockedReason ?? 'missing connector'}`,
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
    dataOrigin: completed ? 'live-readonly-research' : 'external-read-only-pending',
    evidenceIds: candidateEvidenceIds(liveRun.candidates),
    sourceRecordIds: candidateSourceRecordIds(liveRun.candidates).length
      ? candidateSourceRecordIds(liveRun.candidates)
      : [`connector:${liveRun.connectorStatus}`],
    missingFields: completed
      ? candidateMissingFields(liveRun.candidates)
      : [liveRun.blockedReason ?? 'live research connector/tool unavailable'],
    lockedActions: [...WORKSPACE_KERNEL_LOCKED_ACTIONS],
    payload: {
      artifactKind: 'live-product-candidate-packet',
      dataOrigin: 'live-readonly-research',
      liveRun,
      safety: WORKSPACE_KERNEL_SAFETY,
      liveReadOnlyResearchAttempted: liveRun.liveReadOnlyResearchAttempted,
      connectorStatus: liveRun.connectorStatus,
    },
    createdAtMs: nowMs,
  }
}

function normalizeControlledScoutResult(
  result: ControlledAgentRunResult,
  request: EtsyLiveResearchRequest,
  runId: string,
  startedAtMs: number,
) {
  if (!result.ok || !result.output.productScout) {
    return createBlockedEtsyLiveResearchRun({
      request,
      runId,
      nowMs: Date.now(),
      attempted: true,
      connectorStatus: 'blocked',
      reason: result.ok
        ? 'Controlled Scout returned no productScout payload.'
        : `Controlled Scout failed: ${result.error}`,
    })
  }
  const scout = result.output.productScout
  return normalizeEtsyLiveResearchRun({
    runId,
    status: result.output.status === 'blocked' ? 'blocked' : 'completed',
    query: scout.query || request.query,
    candidates: scout.candidates.map((candidate, index) => ({
      candidateId: `${runId}-candidate-${index + 1}`,
      title: candidate.title,
      summary: candidate.niche,
      sourceUrls: candidate.sourceUrls,
      sourceDetails: candidate.sourceDetails,
      evidenceIds: candidate.evidence,
      evidenceQuality: candidate.sourceUrls.length ? 'partial' : 'blocked',
      score: candidate.score ?? undefined,
      missingEvidence: candidate.missingFields,
      riskFlags: candidate.riskNotes,
      dataOrigin: 'live-readonly-research',
      suggestedNextStep: candidate.sourceUrls.length ? 'select_product' : 'needs_more_evidence',
    })),
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date().toISOString(),
  }, { request, runId, startedAtMs }).run
}

type ReadonlySearchHit = {
  title: string
  url: string
  source: 'etsy' | 'supplier' | 'other'
  imageUrl?: string
  priceText?: string
  shopName?: string
  salesText?: string
  demandText?: string
  tags?: Array<string>
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function plainTextFromHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function normalizeResultUrl(rawHref: string) {
  const href = decodeHtmlEntities(rawHref.trim())
  if (!href) return null
  try {
    const url = href.startsWith('http') ? new URL(href) : new URL(href, 'https://www.etsy.com')
    const uddg = url.searchParams.get('uddg') || url.searchParams.get('u')
    const target = uddg && /^https?:\/\//i.test(uddg) ? new URL(uddg) : url
    const etsyListing = target.pathname.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?listing\/(\d+)\/([^/?#]+)/i)
    if (etsyListing && /(^|\.)etsy\.com$/i.test(target.hostname)) {
      target.hostname = 'www.etsy.com'
      target.pathname = `/listing/${etsyListing[1]}/${etsyListing[2]}`
    }
    target.hash = ''
    target.search = ''
    return target.toString()
  } catch {
    return null
  }
}

function sourceForUrl(url: string): ReadonlySearchHit['source'] {
  const lower = url.toLowerCase()
  if (lower.includes('etsy.com/listing/') || lower.includes('etsy.com/il-en/listing/') || lower.includes('/listing/')) return 'etsy'
  if (lower.includes('aliexpress.') || lower.includes('alibaba.') || lower.includes('1688.com')) return 'supplier'
  return 'other'
}

function searchHintsForQuery(query: string) {
  const lower = query.toLowerCase()
  const hints = new Set<string>()
  if (/קרמ|ceramic|קדר/.test(lower)) {
    hints.add('ceramic')
    hints.add('pottery')
    hints.add('stoneware')
  }
  if (/ספל|mug|כוס/.test(lower)) hints.add('mug')
  if (/אגרטל|vase/.test(lower)) hints.add('vase')
  if (/תכש|jewel|necklace|ring|עגיל|שרשרת|טבעת/.test(lower)) hints.add('jewelry')
  if (/אליאקספרס|ali\s?express/.test(lower)) hints.add('AliExpress')
  if (/מוכר|מכירות|יחידות|monthly|sales|sold/.test(lower)) {
    hints.add('bestseller')
    hints.add('monthly sales')
  }
  if (/ספק|supplier|source/.test(lower)) hints.add('supplier')
  return Array.from(hints)
}

function compactSearchQuery(query: string, extra: Array<string> = []) {
  const hints = searchHintsForQuery(query)
  const hasHebrew = /[\u0590-\u05ff]/.test(query)
  const hasUrl = /https?:\/\//i.test(query)
  const base = hasHebrew && hints.length && !hasUrl ? hints : [query, ...hints]
  return [...base, ...extra]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280)
}

function marketplaceSearchTermsForQuery(query: string) {
  const hints = searchHintsForQuery(query).map((hint) => hint.toLowerCase())
  const terms = new Set<string>()
  const ceramic = hints.some((hint) => ['ceramic', 'pottery', 'stoneware'].includes(hint))
  if (ceramic) terms.add('ceramic')
  if (hints.includes('pottery')) terms.add('pottery')
  if (hints.includes('stoneware')) terms.add('stoneware')
  if (hints.includes('vase')) terms.add('vase')
  if (hints.includes('mug')) terms.add('mug')
  if (ceramic && !hints.includes('vase') && !hints.includes('mug')) terms.add('mug')
  if (hints.includes('jewelry')) terms.add('jewelry')
  const searchTerms = Array.from(terms)
  if (searchTerms.length) return searchTerms.join(' ')
  return query
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/["'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'etsy product'
}

function isUsefulReadonlyProductHit(hit: ReadonlySearchHit, query: string) {
  const text = `${hit.title} ${hit.url}`.toLowerCase()
  if (/unavailable|sold out|pattern|crochet|knitting|pdf|svg|download|digital|template|tutorial/.test(text)) return false
  const hints = searchHintsForQuery(query).map((hint) => hint.toLowerCase())
  const physicalHints = hints.filter((hint) => ['ceramic', 'pottery', 'stoneware', 'mug', 'vase', 'jewelry'].includes(hint))
  if (!physicalHints.length) return true
  const aliases = new Set<string>(physicalHints)
  if (physicalHints.includes('ceramic') || physicalHints.includes('pottery') || physicalHints.includes('stoneware')) {
    aliases.add('clay')
    aliases.add('porcelain')
    aliases.add('earthenware')
    aliases.add('cup')
    aliases.add('bowl')
  }
  if (physicalHints.includes('mug')) aliases.add('cup')
  return Array.from(aliases).some((hint) => text.includes(hint))
}

function cleanSearchResultTitle(rawTitle: string, source: ReadonlySearchHit['source']) {
  let title = rawTitle.replace(/\s+/g, ' ').trim()
  title = title.replace(/\s+-\s+Etsy$/i, '')
  if (title.includes(' › ')) title = title.split(' › ').pop()?.trim() || title
  title = title.replace(/^[a-z0-9][a-z0-9-]{8,}\s+(?=[A-Z])/i, '')
  title = title.replace(/^etsy\.com\s*/i, '')
  if (source === 'supplier') {
    title = title
      .replace(/\s*(?:₪|\$|€|£|USD|ILS|US\s*\$|AU\s*\$|C\s*\$)\s?\d[\s\S]*$/i, '')
      .replace(/\s*(?:Free shipping|See preview|Similar items?|Early bird deal|First try offer|Save\s+(?:₪|\$|€|£)?\d[\s\S]*)$/i, '')
      .trim()
  }
  if (!title) return source === 'etsy' ? 'Etsy listing result' : 'Supplier result'
  return title.slice(0, 180)
}

function titleLooksLikeBadge(title: string) {
  return /^(loading|bestseller|popular now|almost sold out|only \d+ left|etsy(?:'|’)?s pick)$/i.test(title.trim())
}

function titleFromProductUrl(url: string, source: ReadonlySearchHit['source']) {
  if (source !== 'etsy') return source === 'supplier' ? 'Supplier result' : 'Product result'
  try {
    const parsed = new URL(url)
    const listingSlug = parsed.pathname.match(/\/listing\/\d+\/([^/?#]+)/i)?.[1]
    if (!listingSlug) return 'Etsy listing result'
    return listingSlug
      .split('-')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .slice(0, 180)
  } catch {
    return 'Etsy listing result'
  }
}

function searchHitTitle(rawTitle: string, url: string, source: ReadonlySearchHit['source']) {
  const title = cleanSearchResultTitle(rawTitle, source)
  return titleLooksLikeBadge(title) ? titleFromProductUrl(url, source) : title
}

function cleanOptionalHttpUrl(value: unknown) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return /^https?:\/\//i.test(text) ? text : undefined
}

function cleanOptionalInlineText(value: unknown, max = 120) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : undefined
}

function extractPriceText(value: unknown) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  const currencyPricePattern = /(?:₪|\$|€|£|USD|ILS|US\s*\$|AU\s*\$|C\s*\$)\s?\d{1,6}(?:[.,]\d{1,2})?/gi
  const matches = text.match(currencyPricePattern)
  if (!matches?.length) return undefined
  const normalized = matches
    .slice(0, 2)
    .map((price) => price.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (!normalized.length) return undefined
  return normalized[0]?.slice(0, 80)
}

function extractSalesText(value: unknown) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  const match = text.match(/(?:\b\d{1,3}(?:[,.]\d{3})*|\b\d+(?:[,.]\d+)?)(?:\+)?\s*(?:sales|sold|מכירות|נמכרו|נמכר)/i)
  return match?.[0]?.slice(0, 80)
}

function extractDemandText(value: unknown) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  const match = text.match(/(?:bestseller|popular now|almost sold out|only \d+ left|\d{1,3}(?:[,.]\d{3})*\s*(?:reviews|ביקורות))/i)
  return match?.[0]?.slice(0, 120)
}

function extractTitleTags(value: string, query = '') {
  const stopWords = new Set([
    'with', 'and', 'for', 'the', 'from', 'gift', 'gifts', 'etsy', 'listing', 'supplier', 'read', 'only',
    'אחד', 'מוצר', 'עם', 'של', 'מתנה', 'יותר', 'יחידות', 'חודשיות', 'ספק', 'מאה', 'אחוז', 'זה',
  ])
  const tokens = `${value} ${query}`
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token))
  return Array.from(new Set(tokens)).slice(0, 8)
}

function disconnectPlaywrightCdp(_browser: unknown) {
  // Do not call Browser.close() or private connection.close() here: this CDP session attaches to
  // the persistent Hermes Chrome profile, and closing the connection can invalidate concurrent
  // browser targets in Vite/API requests. Page cleanup is handled per request.
}

function directBrowserSearchTargets(searchQuery: string, productQuery: string) {
  const terms = marketplaceSearchTermsForQuery(productQuery)
  const lower = searchQuery.toLowerCase()
  const targets: Array<{ label: string; url: string }> = []
  if (lower.includes('etsy')) {
    targets.push({
      label: 'hermes-chrome etsy-search',
      url: `https://www.etsy.com/search?q=${encodeURIComponent(terms)}&explicit=1`,
    })
  }
  if (lower.includes('aliexpress') || lower.includes('alibaba') || lower.includes('supplier')) {
    const aliSlug = encodeURIComponent(terms).replace(/%20/g, '-')
    targets.push({
      label: 'hermes-chrome aliexpress-search',
      url: `https://www.aliexpress.com/w/wholesale-${aliSlug}.html?SearchText=${encodeURIComponent(terms)}`,
    })
  }
  return targets
}

async function runBrowserSearchQuery(searchQuery: string, limit = 8, productQuery = searchQuery) {
  const errors: Array<string> = []
  let browser: unknown
  try {
    const { chromium } = await import('playwright')
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
    const existingContext = (browser as Awaited<ReturnType<typeof chromium.connectOverCDP>>).contexts().at(0)
    const context = existingContext
      ? existingContext
      : await (browser as Awaited<ReturnType<typeof chromium.connectOverCDP>>).newContext()
    const page = await context.newPage()
    try {
      for (const target of directBrowserSearchTargets(searchQuery, productQuery)) {
        try {
          await page.goto(target.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          })
          await page.waitForTimeout(target.label.includes('aliexpress') ? 6200 : target.label.includes('etsy') ? 2200 : 1200)
          const rawHits = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map((anchor) => {
            const card = anchor.closest('li, [data-listing-id], [data-testid], .v2-listing-card, [class*="card"], div')
            const anchorText = (anchor.textContent || '').replace(/\s+/g, ' ').trim()
            const cardText = (card?.textContent || '').replace(/\s+/g, ' ').trim()
            const badgeOnly = /^(loading|bestseller|popular now|almost sold out|only \d+ left|etsy(?:'|’)?s pick)$/i.test(anchorText)
            const image = card?.querySelector('img') || anchor.querySelector('img')
            const imageUrl = image instanceof HTMLImageElement
              ? image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('srcset')?.split(' ')[0] || ''
              : ''
            const textParts = Array.from(card?.querySelectorAll('span, p, div') || [])
              .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
              .filter(Boolean)
            const priceText = textParts.find((text) => /(?:₪|\$|€|£|USD|ILS|US\s*\$|AU\s*\$|C\s*\$)\s?\d|\d+[.,]\d{2}/i.test(text)) || ''
            const shopName = textParts.find((text) => /by\s+[A-Za-z0-9_-]{3,}|Shop/i.test(text)) || ''
            return { title: (!anchorText || badgeOnly ? cardText : anchorText), url: anchor.href, imageUrl, priceText, shopName, cardText }
          }))
          const seen = new Set<string>()
          const hits: Array<ReadonlySearchHit> = []
          for (const raw of rawHits) {
            const url = normalizeResultUrl(raw.url)
            if (!url) continue
            const source = sourceForUrl(url)
            if (source === 'other') continue
            const key = url.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            const hit: ReadonlySearchHit = {
              title: searchHitTitle(raw.title || (source === 'etsy' ? 'Etsy listing result' : 'Supplier result'), url, source),
              url,
              source,
              imageUrl: cleanOptionalHttpUrl(raw.imageUrl),
              priceText: extractPriceText(raw.priceText),
              shopName: cleanOptionalInlineText(raw.shopName, 120),
              salesText: extractSalesText(raw.cardText),
              demandText: extractDemandText(raw.cardText),
              tags: extractTitleTags(raw.title || '', productQuery),
            }
            if (!isUsefulReadonlyProductHit(hit, productQuery)) continue
            hits.push(hit)
            if (hits.length >= limit) break
          }
          if (hits.length) return { hits, errors }
          const bodyText = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
          const blocked = /Verifying you(?:'|’)re not a bot|captcha|unusual traffic|access denied/i.test(bodyText)
          errors.push(`${target.label}: ${blocked ? 'bot/captcha gate' : 'no useful Etsy/supplier physical product links parsed'}`)
        } catch (error) {
          errors.push(`${target.label}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } finally {
      await page.close().catch(() => {})
    }
  } catch (error) {
    errors.push(`browser cdp: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    disconnectPlaywrightCdp(browser)
  }
  return { hits: [] as Array<ReadonlySearchHit>, errors }
}

async function runHermesChromeProductQuery(searchQuery: string, limit = 8, productQuery = searchQuery) {
  const browserResult = await runBrowserSearchQuery(searchQuery, limit, productQuery)
  return { hits: browserResult.hits, errors: browserResult.errors }
}

async function runReadonlyInternetProductSearch(
  request: EtsyLiveResearchRequest,
  context: { runId: string; startedAtMs: number },
) {
  const maxCandidates = request.maxCandidates ?? 3
  const etsyQuery = `site:etsy.com/listing ${compactSearchQuery(request.query, ['Etsy listing'])}`
  const supplierQuery = `site:aliexpress.com/item OR site:alibaba.com/product-detail ${compactSearchQuery(request.query, ['supplier'])}`
  const etsyResult = await runHermesChromeProductQuery(etsyQuery, Math.max(maxCandidates * 3, 8), request.query)
  const supplierResult = await runHermesChromeProductQuery(supplierQuery, 6, request.query)
  const etsyHits = etsyResult.hits.filter((hit) => hit.source === 'etsy')
  const supplierHits = supplierResult.hits.filter((hit) => hit.source === 'supplier')

  if (!etsyHits.length) {
    return createBlockedEtsyLiveResearchRun({
      request,
      runId: context.runId,
      nowMs: Date.now(),
      attempted: true,
      connectorStatus: 'blocked',
      reason: [
        'Read-only internet search ran but returned no parseable Etsy listing results.',
        ...etsyResult.errors.slice(0, 5),
      ].join(' '),
    })
  }

  return normalizeEtsyLiveResearchRun({
    runId: context.runId,
    status: 'completed',
    query: request.query,
    startedAt: new Date(context.startedAtMs).toISOString(),
    completedAt: new Date().toISOString(),
    candidates: etsyHits.slice(0, maxCandidates).map((hit, index) => {
      const matchingSupplier = supplierHits.at(index)
      return {
        candidateId: `${context.runId}-internet-${index + 1}`,
        title: hit.title,
        summary: matchingSupplier
          ? 'Read-only internet result: Etsy competitor plus supplier search lead. Verify exact visual match before approval.'
          : 'Read-only internet result: Etsy competitor found. Supplier exact-match proof still required.',
        sourceUrls: matchingSupplier ? [hit.url, matchingSupplier.url] : [hit.url],
        sourceDetails: [
          {
            kind: 'etsy',
            label: 'מתחרה Etsy',
            marketplace: 'Etsy',
            title: hit.title,
            url: hit.url,
            imageUrl: hit.imageUrl,
            priceText: hit.priceText,
            shopName: hit.shopName,
            salesText: hit.salesText,
            demandText: hit.demandText,
            tags: hit.tags,
          },
          ...(matchingSupplier ? [{
            kind: 'supplier' as const,
            label: 'ספק',
            marketplace: matchingSupplier.url.includes('alibaba.') ? 'Alibaba' : 'AliExpress',
            title: matchingSupplier.title,
            url: matchingSupplier.url,
            imageUrl: matchingSupplier.imageUrl,
            priceText: matchingSupplier.priceText,
            shopName: matchingSupplier.shopName,
            salesText: matchingSupplier.salesText,
            demandText: matchingSupplier.demandText,
            tags: matchingSupplier.tags,
          }] : []),
        ],
        evidenceIds: [
          `etsy-internet:${hit.url}`,
          ...(matchingSupplier ? [`supplier-search:${matchingSupplier.url}`] : []),
        ],
        evidenceQuality: matchingSupplier ? 'partial' : 'weak',
        score: matchingSupplier ? 64 : 48,
        missingEvidence: [
          'Alura monthly sales proof / 40+ monthly units not verified yet',
          'exact AliExpress/Alibaba visual match proof',
          ...(!hit.imageUrl ? ['source image reference for ShotLab'] : []),
          'variant truth',
          'competitor tags/title/description extraction',
          'supplier price/cost proof',
        ],
        riskFlags: [
          'Read-only internet result only; do not approve without Alura + supplier visual QA.',
          'No Etsy upload/edit/publish is allowed from this step.',
        ],
        dataOrigin: 'live-readonly-research',
        suggestedNextStep: 'select_product',
      }
    }),
  }, { request, runId: context.runId, startedAtMs: context.startedAtMs }).run
}

async function defaultLiveResearchRunner(
  request: EtsyLiveResearchRequest,
  context: { runId: string; startedAtMs: number; cwd?: string },
) {
  if (process.env.WAR_ROOM_ETSY_LIVE_SCOUT_ENABLED === 'true') {
    const result = await runControlledAgentOneShot({
      agentId: 'scout',
      runId: context.runId,
      cwd: context.cwd,
      timeoutMs: 45_000,
    })
    return normalizeControlledScoutResult(result, request, context.runId, context.startedAtMs)
  }

  return runReadonlyInternetProductSearch(request, context)
}

function activeRunner() {
  return testRunner ?? defaultLiveResearchRunner
}

export function setEtsyLiveResearchRunnerForTests(runner?: EtsyLiveResearchRunner) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setEtsyLiveResearchRunnerForTests is only available in tests.')
  }
  testRunner = runner
}

export async function runEtsyLiveScoutBackend(input: {
  requestBody: unknown
  nowMs?: number
  cwd?: string
}): Promise<EtsyLiveScoutBackendResult> {
  const startedAtMs = input.nowMs ?? Date.now()
  const request = normalizeEtsyLiveResearchRequest(input.requestBody)
  const runId = liveRunId(startedAtMs)
  let kernelRun = appendRunStarted(createKernelRun(request, runId, startedAtMs), request, startedAtMs + 2)

  let liveRun: EtsyLiveResearchRun
  try {
    const rawResult = await activeRunner()(request, { runId, startedAtMs, cwd: input.cwd })
    liveRun = normalizeEtsyLiveResearchRun(rawResult, {
      request,
      runId,
      startedAtMs,
      completedAtMs: Date.now(),
    }).run
  } catch (error) {
    liveRun = createBlockedEtsyLiveResearchRun({
      request,
      runId,
      nowMs: Date.now(),
      attempted: true,
      connectorStatus: 'blocked',
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  const artifact = createLiveArtifact(kernelRun, liveRun, startedAtMs + 3)
  kernelRun = attachWorkspaceArtifact({ runs: [kernelRun] }, kernelRun.runId, artifact).runs[0]
  kernelRun = liveRun.status === 'completed'
    ? completeWorkspaceRun({ runs: [kernelRun] }, kernelRun.runId, `${artifact.summary} Live actions remain locked.`, startedAtMs + 4).run ?? kernelRun
    : blockWorkspaceRun({ runs: [kernelRun] }, kernelRun.runId, artifact.summary, startedAtMs + 4).runs[0]

  const telemetry = workspaceKernelTelemetryFromRun(kernelRun, {
    agentId: 'loki',
    motion: liveRun.status === 'completed' ? 'idle' : 'blocked',
    artifactKind: 'live-product-candidate-packet',
    eventId: kernelRun.events[kernelRun.events.length - 1]?.eventId,
  })
  const persistedState = await persistWorkspaceKernelRuns([kernelRun], telemetry)
  const responseState: WorkspaceKernelPersistedState = {
    ...persistedState,
    runs: [kernelRun],
    events: kernelRun.events,
    telemetry,
  }

  return {
    ok: true,
    liveRun,
    state: responseState,
    run: kernelRun,
    artifact,
    telemetry,
    displayStates: buildKernelAgentDisplayStates(responseState),
    safety: WORKSPACE_KERNEL_SAFETY,
    lockedActions: kernelRun.lockedActions,
  }
}

export async function getEtsyLiveScoutState() {
  const state = await loadWorkspaceKernelState()
  const runs = state.runs.filter((run) =>
    run.artifacts.some((artifact) => artifact.kind === 'live-product-candidate-packet'),
  )
  return {
    ok: true,
    state,
    runs,
    latestRun: runs[0],
    telemetry: state.telemetry,
    displayStates: buildKernelAgentDisplayStates(state),
    safety: WORKSPACE_KERNEL_SAFETY,
    lockedActions: runs[0]?.lockedActions ?? WORKSPACE_KERNEL_LOCKED_ACTIONS,
  }
}
