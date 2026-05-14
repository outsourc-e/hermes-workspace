import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { BEARER_TOKEN, ensureGatewayProbed, getResolvedUrls } from '../../server/gateway-capabilities'

type DecomposeRequest = {
  prompt?: unknown
  workers?: unknown
  model?: unknown
}

type WorkerHint = {
  id: string
  role?: string
  model?: string
  specialty?: string
  mission?: string
  skills?: Array<string>
  capabilities?: Array<string>
  notes?: string
}

type RouteAssignment = {
  workerId: string
  task: string
  rationale: string
}

const SYSTEM = `You are an orchestrator that decomposes a single high-level user prompt into focused sub-tasks routed to the most appropriate worker agents in a parallel Claude swarm.

Rules:
- Output ONLY valid minified JSON matching this shape: {"assignments":[{"workerId":"swarm1","task":"...","rationale":"..."}],"unassigned":["...optional reasons"]}
- Use only the worker IDs that exist in the provided roster.
- Each task must be a complete, self-contained instruction the worker can execute without additional context.
- Prefer workers whose role, specialty, mission, skills, and capabilities match the task.
- Assign implementation tasks to builder/UI/backend lanes, research to research lanes, review/quality gates to reviewer lanes, PR/issue tasks to PR lanes, and ops/runtime tasks to ops/backend lanes.
- Skip workers that don't fit. Do not pad assignments.
- Never invent worker IDs.
- Keep rationale short (one sentence).
`

async function callOrchestrator(prompt: string, workers: WorkerHint[], model: string): Promise<{ assignments: RouteAssignment[]; unassigned: string[] }>{
  const rosterText = workers
    .map((worker) => {
      const parts = [
        worker.role ? `role=${worker.role}` : '',
        worker.model ? `model=${worker.model}` : '',
        worker.specialty ? `specialty=${worker.specialty}` : '',
        worker.mission ? `mission=${worker.mission}` : '',
        worker.skills?.length ? `skills=${worker.skills.join(',')}` : '',
        worker.capabilities?.length ? `capabilities=${worker.capabilities.join(',')}` : '',
        worker.notes ? `notes=${worker.notes}` : '',
      ].filter(Boolean).join('; ')
      return `- ${worker.id}${parts ? ` — ${parts}` : ''}`
    })
    .join('\n')

  const body = {
    model,
    stream: false,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Available swarm workers:\n${rosterText}\n\nUser prompt to decompose:\n${prompt}\n\nReturn the JSON now.`,
      },
    ],
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (BEARER_TOKEN) headers.Authorization = `Bearer ${BEARER_TOKEN}`

  const { gateway } = getResolvedUrls()
  const res = await fetch(`${gateway}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Orchestrator HTTP ${res.status}: ${text.slice(0, 240)}`)
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!raw) throw new Error('Orchestrator returned empty content')

  // Tolerant JSON extraction (in case the model wraps it).
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Orchestrator did not return JSON. Snippet: ${raw.slice(0, 240)}`)
  }
  const slice = raw.slice(start, end + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch (error) {
    throw new Error(`Orchestrator returned invalid JSON: ${(error as Error).message}`)
  }

  const obj = parsed as { assignments?: unknown; unassigned?: unknown }
  const assignmentsRaw = Array.isArray(obj.assignments) ? obj.assignments : []
  const validIds = new Set(workers.map((worker) => worker.id))
  const assignments: RouteAssignment[] = []
  for (const entry of assignmentsRaw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const workerId = typeof item.workerId === 'string' ? item.workerId.trim() : ''
    const task = typeof item.task === 'string' ? item.task.trim() : ''
    const rationale = typeof item.rationale === 'string' ? item.rationale.trim() : ''
    if (!workerId || !task) continue
    if (!validIds.has(workerId)) continue
    assignments.push({ workerId, task, rationale })
  }
  const unassignedRaw = Array.isArray(obj.unassigned) ? obj.unassigned : []
  const unassigned: string[] = []
  for (const entry of unassignedRaw) {
    if (typeof entry === 'string' && entry.trim()) unassigned.push(entry.trim())
  }
  return { assignments, unassigned }
}


function scoreWorker(prompt: string, worker: WorkerHint): number {
  const text = [worker.id, worker.role, worker.model, worker.specialty, worker.mission, ...(worker.skills ?? []), ...(worker.capabilities ?? []), worker.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const lower = prompt.toLowerCase()
  let score = 0
  const pairs: Array<[RegExp, Array<string>]> = [
    [/research|investigate|options|tradeoff|source|synth/i, ['research', 'analysis']],
    [/build|implement|code|patch|ui|frontend|backend|api|fix/i, ['builder', 'implementation', 'ui', 'backend', 'runtime']],
    [/review|test|verify|quality|regression|gate/i, ['reviewer', 'review', 'pr', 'issues']],
    [/pr|issue|github|repro/i, ['pr', 'issues', 'github']],
    [/ops|health|runtime|tmux|gateway/i, ['ops', 'runtime', 'backend']],
    [/docs|handoff|spec|readme/i, ['docs', 'scribe']],
  ]
  for (const [pattern, terms] of pairs) {
    if (!pattern.test(lower)) continue
    for (const term of terms) if (text.includes(term)) score += 3
  }
  if (text.includes('swarm-worker-core')) score += 1
  return score
}

function heuristicAssignments(prompt: string, workers: WorkerHint[]): { assignments: RouteAssignment[]; unassigned: string[] } {
  const ranked = [...workers]
    .map((worker) => ({ worker, score: scoreWorker(prompt, worker) }))
    .sort((a, b) => b.score - a.score || a.worker.id.localeCompare(b.worker.id))
  const selected = ranked.filter((row) => row.score > 0).slice(0, Math.min(3, workers.length))
  const fallback = selected.length ? selected : ranked.slice(0, Math.min(2, workers.length))
  const assignments = fallback.map(({ worker }) => ({
    workerId: worker.id,
    task: `Handle your lane for this Swarm2 mission and return only the required proof checkpoint. Mission: ${prompt}`,
    rationale: `Fallback roster match for ${worker.role || worker.id}.`,
  }))
  return {
    assignments,
    unassigned: selected.length ? [] : ['Model decomposition failed or produced no confident matches; used deterministic roster fallback.'],
  }
}

export const Route = createFileRoute('/api/swarm-decompose')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()
        let body: DecomposeRequest
        try { body = await request.json() as DecomposeRequest } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }) }

        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        if (!prompt) return json({ error: 'prompt required' }, { status: 400 })
        if (prompt.length > 16_000) return json({ error: 'prompt too long' }, { status: 400 })

        const workersRaw = Array.isArray(body.workers) ? body.workers : []
        const workers: WorkerHint[] = []
        for (const entry of workersRaw) {
          if (!entry || typeof entry !== 'object') continue
          const obj = entry as Record<string, unknown>
          const id = typeof obj.id === 'string' ? obj.id.trim() : ''
          if (!id || id === 'workspace') continue
          workers.push({
            id,
            role: typeof obj.role === 'string' ? obj.role : undefined,
            model: typeof obj.model === 'string' ? obj.model : undefined,
            specialty: typeof obj.specialty === 'string' ? obj.specialty : undefined,
            mission: typeof obj.mission === 'string' ? obj.mission : undefined,
            skills: Array.isArray(obj.skills) ? obj.skills.filter((value): value is string => typeof value === 'string') : undefined,
            capabilities: Array.isArray(obj.capabilities) ? obj.capabilities.filter((value): value is string => typeof value === 'string') : undefined,
            notes: typeof obj.notes === 'string' ? obj.notes : undefined,
          })
        }
        if (workers.length === 0) return json({ error: 'workers[] required' }, { status: 400 })

        const requestedModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : (process.env.CLAUDE_DEFAULT_MODEL ?? 'claude-opus-4-7')

        try {
          const result = await callOrchestrator(prompt, workers, requestedModel)
          return json({
            ok: true,
            decomposedAt: Date.now(),
            model: requestedModel,
            ...result,
          })
        } catch (error) {
          const fallback = heuristicAssignments(prompt, workers)
          return json({
            ok: true,
            fallback: true,
            warning: error instanceof Error ? error.message : 'decompose failed',
            decomposedAt: Date.now(),
            model: requestedModel,
            ...fallback,
          })
        }
      },
    },
  },
})
