/**
 * Phase 3.2: Real data for global search
 * Fetches Session Cards, files, and activity from existing sources
 */
import { useQuery } from '@tanstack/react-query'
// import type { ActivityEvent } from '@/types/activity-event'
// Activity events disabled in search — SSE connection caused freezing
// import { useActivityEvents } from '@/screens/activity/use-activity-events'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { fetchSessionCards } from '@/screens/chat/chat-queries'

const REQUEST_TIMEOUT_MS = 3_000
const SESSION_CARDS_STALE_TIME_MS = 60_000
const FILES_STALE_TIME_MS = 2 * 60_000
const SKILLS_STALE_TIME_MS = 2 * 60_000
const SEARCH_QUERY_GC_TIME_MS = 10 * 60_000
const MAX_SEARCH_FILES = 2_500

export type SearchSessionCard = {
  cardId: string
  title: string
  updatedAt: number
  inspectableChildren: Array<{
    cardId: string
    title: string
  }>
}

export type SearchFile = {
  id: string
  path: string
  name: string
  type: 'file' | 'folder'
}

export type SearchSkill = {
  id: string
  name: string
  description: string
  installed: boolean
}

export type SearchActivity = {
  id: string
  title: string
  detail?: string
  timestamp: number
  level: string
  source?: string
}

type FilesApiResponse = {
  entries?: Array<Record<string, unknown>>
}

type SkillsApiResponse = {
  ok?: boolean
  skills?: Array<Record<string, unknown>>
}

type SearchQueryScope =
  | 'all'
  | 'chats'
  | 'files'
  | 'agents'
  | 'skills'
  | 'actions'

function withTimeoutSignal(querySignal?: AbortSignal): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  function handleQueryAbort() {
    controller.abort()
  }

  querySignal?.addEventListener('abort', handleQueryAbort, { once: true })

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      querySignal?.removeEventListener('abort', handleQueryAbort)
    },
  }
}

async function fetchJsonWithTimeout<T>(
  input: string,
  querySignal?: AbortSignal,
): Promise<T | null> {
  const { signal, cleanup } = withTimeoutSignal(querySignal)

  try {
    const res = await fetch(input, { signal })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    if (!json) return null
    return json as T
  } catch {
    return null
  } finally {
    cleanup()
  }
}

function flattenFileTree(
  entries: Array<Record<string, unknown>>,
  maxEntries: number,
): Array<SearchFile> {
  const flattened: Array<SearchFile> = []
  const stack = [...entries]

  while (stack.length > 0 && flattened.length < maxEntries) {
    const entry = stack.pop()
    if (!entry) continue

    const path = String(entry.path || '')
    const name = String(entry.name || '')
    const type = String(entry.type || 'file')

    if (
      path.length > 0 &&
      name.length > 0 &&
      (type === 'file' || type === 'folder')
    ) {
      flattened.push({
        id: path,
        path,
        name,
        type,
      })
    }

    if (Array.isArray(entry.children)) {
      const children = entry.children as Array<Record<string, unknown>>
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]
        if (child) stack.push(child)
      }
    }
  }

  return flattened
}

function hasCompleteCardResolution(
  response: SessionCardListWire,
  cardId: string,
): boolean {
  const matches = response.cardResolutions.filter(
    (resolution) => resolution.cardId === cardId,
  )
  return (
    matches.length === 1 &&
    matches[0]!.completeness === 'complete' &&
    matches[0]!.retryable === false
  )
}

/**
 * Reduce the strict Session Card wire response to the only chat data global
 * Search may retain. Segment keys, raw child session keys, and previews never
 * cross this boundary.
 */
export function projectSearchSessionCards(
  response: SessionCardListWire,
): Array<SearchSessionCard> {
  if (response.completeness !== 'complete' || response.retryable) return []

  return response.cards.flatMap((card) => {
    if (
      card.relationshipKind !== 'root' ||
      card.parentCardId !== undefined ||
      !hasCompleteCardResolution(response, card.cardId)
    ) {
      return []
    }
    return [
      {
        cardId: card.cardId,
        title: card.title,
        updatedAt: card.updatedAt,
        inspectableChildren: card.childNodes.map((child) => ({
          cardId: child.cardId,
          title: child.title,
        })),
      },
    ]
  })
}

export async function fetchSearchSessionCards(): Promise<
  Array<SearchSessionCard>
> {
  try {
    return projectSearchSessionCards(await fetchSessionCards())
  } catch {
    return []
  }
}

async function fetchFiles(
  querySignal?: AbortSignal,
): Promise<Array<SearchFile>> {
  const data = await fetchJsonWithTimeout<FilesApiResponse>(
    '/api/files?action=list&maxDepth=5&maxEntries=2500',
    querySignal,
  )
  if (!data) return []

  const entries = Array.isArray(data.entries) ? data.entries : []
  return flattenFileTree(entries, MAX_SEARCH_FILES)
}

async function fetchSkills(
  querySignal?: AbortSignal,
): Promise<Array<SearchSkill>> {
  const data = await fetchJsonWithTimeout<SkillsApiResponse>(
    '/api/skills?summary=search&limit=120',
    querySignal,
  )
  if (!data) return []
  if (typeof data.ok === 'boolean' && !data.ok) return []
  const skills = Array.isArray(data.skills) ? data.skills : []

  return skills.map((skill: Record<string, unknown>) => {
    const name = String(skill.name || 'Unknown Skill')
    return {
      id: String(skill.id || name.toLowerCase().replaceAll(' ', '-')),
      name,
      description: String(skill.description || ''),
      installed: Boolean(skill.installed),
    }
  })
}

export function useSearchData(scope: SearchQueryScope) {
  const sessionsAvailable = useFeatureAvailable('sessions')
  const skillsAvailable = useFeatureAvailable('skills')

  // Session Cards
  const sessionsQuery = useQuery({
    queryKey: ['search', 'session-cards'],
    queryFn: fetchSearchSessionCards,
    enabled: sessionsAvailable && (scope === 'all' || scope === 'chats'),
    staleTime: SESSION_CARDS_STALE_TIME_MS,
    gcTime: SEARCH_QUERY_GC_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Files
  const filesQuery = useQuery({
    queryKey: ['search', 'files'],
    queryFn: ({ signal }) => fetchFiles(signal),
    enabled: scope === 'all' || scope === 'files',
    staleTime: FILES_STALE_TIME_MS,
    gcTime: SEARCH_QUERY_GC_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Skills
  const skillsQuery = useQuery({
    queryKey: ['search', 'skills'],
    queryFn: ({ signal }) => fetchSkills(signal),
    enabled: skillsAvailable && (scope === 'all' || scope === 'skills'),
    staleTime: SKILLS_STALE_TIME_MS,
    gcTime: SEARCH_QUERY_GC_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Activity events disabled — SSE to /api/events caused UI freeze
  const activityResults: Array<SearchActivity> = []

  return {
    sessionCards: sessionsQuery.data || [],
    files: filesQuery.data || [],
    skills: skillsQuery.data || [],
    activity: activityResults,
    isLoading:
      sessionsQuery.isLoading || filesQuery.isLoading || skillsQuery.isLoading,
  }
}

// Client-side filtering
export function filterResults<T extends Record<string, unknown>>(
  items: Array<T>,
  query: string,
  fields: Array<keyof T>,
  maxResults = Number.POSITIVE_INFINITY,
): Array<T> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    if (!Number.isFinite(maxResults)) return items
    return items.slice(0, Math.max(0, Math.floor(maxResults)))
  }

  const output: Array<T> = []

  for (const item of items) {
    let matched = false
    for (const field of fields) {
      const value = item[field]
      if (typeof value !== 'string') continue
      if (value.toLowerCase().includes(normalizedQuery)) {
        matched = true
        break
      }
    }

    if (!matched) continue
    output.push(item)
    if (output.length >= maxResults) break
  }

  return output
}
