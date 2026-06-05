import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { requireLocalOrAuth } from '../../server/auth-middleware'

const execFileAsync = promisify(execFile)

const AGENT_BUS_DIR =
  process.env.AGENT_BUS_OUTPUT_DIR ||
  '/opt/central-inteligencia/runtime/hermes-agent-bus'
const STATUS_PATH = join(AGENT_BUS_DIR, 'agent-bus-status.json')
const EVENTS_PATH = join(AGENT_BUS_DIR, 'agent-events-current.jsonl')
const REPORT_PATH = join(AGENT_BUS_DIR, 'ESTADO_DA_TROPA.md')
const MISSIONS_DIR = join(AGENT_BUS_DIR, 'missions')
const AGENT_BUS_SCRIPT =
  process.env.AGENT_BUS_SCRIPT ||
  '/opt/central-inteligencia/services/hermes-agent-bus/agent_bus.py'

const HANDOFF_CONTRACTS: Record<string, { businessScope: string; reason: string }> = {
  'dona-helena->larissinha': {
    businessScope: 'DES',
    reason: 'duvida_juridica_interna',
  },
  'larissinha->dona-helena': {
    businessScope: 'DES',
    reason: 'cliente_precisa_sac',
  },
  'dra-clara-des->hermes': {
    businessScope: 'DES',
    reason: 'lead_ou_venda_precisa_supervisao',
  },
  'clara-sdr->hermes': {
    businessScope: '100K',
    reason: 'lead_quente_ou_handoff_comercial',
  },
  'fofoqueiro->hermes': {
    businessScope: '100K',
    reason: 'sinal_de_grupo_ou_risco_operacional',
  },
  'hermes->thumbnail-worker': {
    businessScope: 'Advogando',
    reason: 'missao_de_criativo',
  },
}

type AgentBusStatus = {
  checked_at?: string
  registry_last_updated?: string
  summary?: {
    total?: number
    up?: number
    down?: number
    no_endpoint?: number
    non_operational?: number
    events?: number
  }
  agents?: Array<Record<string, unknown>>
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function readEvents(): Array<Record<string, unknown>> {
  if (!existsSync(EVENTS_PATH)) return []
  return readFileSync(EVENTS_PATH, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>
      } catch {
        return { error: 'json_invalido', raw: line.slice(0, 500) }
      }
    })
}

function readMissions(limit = 12): Array<Record<string, unknown>> {
  if (!existsSync(MISSIONS_DIR)) return []
  return readdirSync(MISSIONS_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => {
      const path = join(MISSIONS_DIR, name)
      const mission = readJsonFile<Record<string, unknown>>(path, {
        error: 'json_invalido',
      })
      return { ...mission, path }
    })
}

function readReportPreview(): string {
  if (!existsSync(REPORT_PATH)) return ''
  return readFileSync(REPORT_PATH, 'utf-8').slice(0, 6000)
}

function issueAgents(status: AgentBusStatus): Array<Record<string, unknown>> {
  const agents = Array.isArray(status.agents) ? status.agents : []
  return agents.filter((agent) => {
    const statusConfig = String(agent.status_config ?? '')
    const health = String(agent.health ?? '')
    const operational = statusConfig === 'active' || statusConfig === 'observer_mode'
    return !operational || health !== 'up'
  })
}

function utcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function writeMission(payload: Record<string, unknown>): string {
  mkdirSync(MISSIONS_DIR, { recursive: true })
  const target = String(payload.target ?? 'mission').replace(/[^a-z0-9-]/gi, '-')
  const missionType = String(payload.mission_type ?? 'mission').replace(/[^a-z0-9-]/gi, '-')
  const path = join(MISSIONS_DIR, `${utcStamp()}-${missionType}-${target}.json`)
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  return path
}

async function syncRoadmap() {
  const result = await execFileAsync('/usr/bin/python3', [AGENT_BUS_SCRIPT, '--sync-roadmap'], {
    cwd: '/opt/central-inteligencia',
    timeout: 60_000,
  })
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

async function handleAction(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, error: 'JSON invalido' }, { status: 400 })
  }

  const action = String(body.action ?? '')
  if (action === 'sync-roadmap') {
    try {
      return Response.json({ ok: true, action, result: await syncRoadmap() })
    } catch (err) {
      return Response.json(
        { ok: false, action, error: err instanceof Error ? err.message : 'sync falhou' },
        { status: 500 },
      )
    }
  }

  if (action === 'thumbnail-mission') {
    const target = String(body.target ?? 'vini').toLowerCase()
    if (!['vini', 'daiane'].includes(target)) {
      return Response.json({ ok: false, error: 'target invalido' }, { status: 400 })
    }
    const brief =
      String(body.brief ?? '').trim() ||
      (target === 'vini'
        ? 'Criar thumbnail operacional para briefing do Vinicius'
        : 'Criar thumbnail operacional para briefing da Daiane')
    const payload = {
      ok: true,
      mission_type: 'thumbnail',
      target,
      brief,
      render: false,
      allow_paid_provider: false,
      safe_mode: true,
      source: 'hermes-workspace',
      created_at: new Date().toISOString(),
    }
    return Response.json({ ok: true, action, mission: { ...payload, mission_record_path: writeMission(payload) } })
  }

  if (action === 'handoff-mission') {
    const source = String(body.source ?? 'dona-helena').toLowerCase()
    const target = String(body.target ?? 'larissinha').toLowerCase()
    const key = `${source}->${target}`
    const contract = HANDOFF_CONTRACTS[key]
    if (!contract) {
      return Response.json({ ok: false, error: 'contrato de handoff nao aprovado', key }, { status: 400 })
    }
    const payload = {
      ok: true,
      mission_type: 'handoff',
      source_agent: source,
      target,
      business_scope: contract.businessScope,
      reason: contract.reason,
      external_actions: [],
      safe_mode: true,
      source: 'hermes-workspace',
      created_at: new Date().toISOString(),
    }
    return Response.json({ ok: true, action, mission: { ...payload, mission_record_path: writeMission(payload) } })
  }

  return Response.json({ ok: false, error: 'acao desconhecida' }, { status: 400 })
}

export const Route = createFileRoute('/api/agent-bus')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const status = readJsonFile<AgentBusStatus>(STATUS_PATH, {})
        return Response.json({
          ok: true,
          status,
          events: readEvents(),
          missions: readMissions(),
          issues: issueAgents(status),
          reportPreview: readReportPreview(),
          paths: {
            status: STATUS_PATH,
            events: EVENTS_PATH,
            report: REPORT_PATH,
            missions: MISSIONS_DIR,
          },
        })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return handleAction(request)
      },
    },
  },
})
