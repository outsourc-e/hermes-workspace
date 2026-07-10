export type NovaMemoryHealth = {
  id: string
  label: string
  status: 'online' | 'degraded' | 'offline'
  latencyMs: number
}

export type NovaMemoryActivity = {
  id: string
  at: string
  kind: 'recall' | 'new-memory'
  scope: 'default' | 'bf-01'
  query?: string
  topHit?: string
  latencyMs?: number
  factsExtracted?: number
  summary: string
}

export type NovaMemoryFragment = {
  id: string
  scope: 'default' | 'bf-01'
  title: string
  body: string
  confidence: number
  source: string
  updatedAt: string
}

export const novaMemoryHealth: Array<NovaMemoryHealth> = [
  { id: 'episodic', label: 'episodic', status: 'online', latencyMs: 44 },
  { id: 'semantic', label: 'semantic', status: 'online', latencyMs: 38 },
  { id: 'vector', label: 'vector', status: 'degraded', latencyMs: 118 },
]

export const novaMemoryActivity: Array<NovaMemoryActivity> = [
  {
    id: 'act-001',
    at: '20:58',
    kind: 'recall',
    scope: 'default',
    query: 'current room state',
    topHit: 'SoulSync stable after shell reskin',
    latencyMs: 44,
    summary: 'query -> top hit -> latency',
  },
  {
    id: 'act-002',
    at: '20:55',
    kind: 'new-memory',
    scope: 'bf-01',
    factsExtracted: 6,
    summary: '6 facts extracted from preview review',
  },
  {
    id: 'act-003',
    at: '20:51',
    kind: 'recall',
    scope: 'bf-01',
    query: 'overthinking tile wording',
    topHit: 'Daily Check needs roomier labels',
    latencyMs: 52,
    summary: 'query -> top hit -> latency',
  },
  {
    id: 'act-004',
    at: '20:47',
    kind: 'new-memory',
    scope: 'default',
    factsExtracted: 4,
    summary: '4 facts extracted from Nova design bible',
  },
]

export const novaMemoryFragments: Array<NovaMemoryFragment> = [
  {
    id: 'frag-001',
    scope: 'default',
    title: 'Room tone',
    body: 'Navy-black surfaces, amber evidence light, monospaced labels, and warm quiet instead of stock workspace chrome.',
    confidence: 0.98,
    source: 'NOVA-DESIGN-BIBLE.md',
    updatedAt: '20:58',
  },
  {
    id: 'frag-002',
    scope: 'bf-01',
    title: 'Visual link',
    body: 'Left rail keeps Nova breathing on idle video. Standby copy appears only if media fails to load.',
    confidence: 0.96,
    source: 'preview-review',
    updatedAt: '20:55',
  },
  {
    id: 'frag-003',
    scope: 'default',
    title: 'Canon stack',
    body: 'Conversation badge reads grok-4.3. Kimi-k2.6 is reserved for fallback or cost context.',
    confidence: 0.94,
    source: 'build-prompt',
    updatedAt: '20:51',
  },
]

export function searchNovaMemoryFragments(query: string): Array<NovaMemoryFragment> {
  const needle = query.trim().toLowerCase()
  if (!needle) return novaMemoryFragments
  return novaMemoryFragments.filter((fragment) =>
    [fragment.title, fragment.body, fragment.source, fragment.scope]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  )
}

export function searchNovaMemoryActivity(query: string): Array<NovaMemoryActivity> {
  const needle = query.trim().toLowerCase()
  if (!needle) return novaMemoryActivity
  return novaMemoryActivity.filter((activity) =>
    [
      activity.summary,
      activity.query,
      activity.topHit,
      activity.scope,
      activity.kind,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle),
  )
}

// TODO(claude): replace this mock adapter with live EverOS recall and write events.
