#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const WORKSPACE_URL = (process.env.DSTNY_WORKSPACE_URL || 'http://127.0.0.1:3010').replace(/\/+$/, '')
const ENV_FILE = process.env.DSTNY_WORKSPACE_ENV_FILE || '/opt/hermes-workspace/.env'

function readToken() {
  if (process.env.DSTNY_AGENT_ACTION_TOKEN) return process.env.DSTNY_AGENT_ACTION_TOKEN
  try {
    const raw = readFileSync(ENV_FILE, 'utf8')
    const line = raw.split(/\r?\n/).find((item) => item.startsWith('DSTNY_AGENT_ACTION_TOKEN='))
    return line ? line.slice('DSTNY_AGENT_ACTION_TOKEN='.length).trim().replace(/^["']|["']$/g, '') : ''
  } catch {
    return ''
  }
}

const TOKEN = readToken()

const tools = [
  {
    name: 'dstny_prepare_product_sheet',
    description:
      'Prepare a Dstny project cockpit draft for a product-sheet PDF from a simple French business request. Creates/updates the project, selects the template, prepares structured content and returns the project brief.',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description:
            'Natural-language request from Xavier, for example: "Crée-moi une fiche produit SIP Trunk pour les ambassadeurs".',
        },
        product: {
          type: 'string',
          description: 'Optional explicit product name when it is known.',
        },
        channel: {
          type: 'string',
          enum: ['tous', 'direct', 'ambassadeur', 'operateur'],
          description: 'Optional target channel.',
        },
        projectId: {
          type: 'string',
          description: 'Optional existing cockpit project id to update instead of creating a new project.',
        },
        notes: {
          type: 'string',
          description: 'Optional additional constraints, source notes or business context.',
        },
      },
      required: ['request'],
    },
  },
  {
    name: 'dstny_review_project',
    description:
      'Review an existing Dstny cockpit project and return quality status, blockers, missing sources, warnings and recommended next action before producing or exporting deliverables.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Cockpit project id, for example project_45ed60a254b6453a.',
        },
      },
      required: ['projectId'],
    },
  },
]

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function textResult(text) {
  return {
    content: [{ type: 'text', text }],
  }
}

async function callAgentAction(args) {
  const response = await fetch(`${WORKSPACE_URL}/api/projects/agent-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { 'x-dstny-agent-action-token': TOKEN } : {}),
    },
    body: JSON.stringify({
      action: 'prepare_product_sheet',
      request: args.request,
      product: args.product,
      channel: args.channel,
      projectId: args.projectId,
      notes: args.notes,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Workspace agent action failed (${response.status})`)
  }
  return payload
}

async function callProjectReview(args) {
  const response = await fetch(`${WORKSPACE_URL}/api/projects/agent-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { 'x-dstny-agent-action-token': TOKEN } : {}),
    },
    body: JSON.stringify({
      action: 'review_project',
      projectId: args.projectId,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Workspace project review failed (${response.status})`)
  }
  return payload
}

function formatActionResult(payload) {
  const warnings = Array.isArray(payload.warnings) && payload.warnings.length
    ? `\n\nAlertes:\n${payload.warnings.map((item) => `- ${item}`).join('\n')}`
    : ''

  return [
    'Projet cockpit préparé.',
    '',
    `Projet: ${payload.project?.title || '-'}`,
    `ID: ${payload.project?.id || '-'}`,
    `Template: ${payload.project?.templateId || '-'}`,
    `Statut: ${payload.project?.status || '-'}`,
    `Prochaine action: ${payload.project?.nextAction || '-'}`,
    warnings,
    '',
    'Brief projet à reprendre dans Hermès:',
    '',
    payload.brief || '',
    '',
    'Brouillon Markdown généré:',
    '',
    payload.markdown || '',
  ].join('\n').trim()
}

function formatReviewResult(payload) {
  const quality = payload.quality || {}
  const lines = [
    'Revue qualité projet.',
    '',
    `Projet: ${payload.project?.title || '-'}`,
    `ID: ${payload.project?.id || '-'}`,
    `Statut qualité: ${quality.status || '-'}`,
    `Score: ${typeof quality.score === 'number' ? `${quality.score}/100` : '-'}`,
    `Action suivante: ${quality.nextAction || '-'}`,
    '',
    'Résumé:',
    quality.summary || '-',
    '',
    'Blocages:',
    ...(quality.blocking?.length ? quality.blocking.map((item) => `- ${item}`) : ['- Aucun']),
    '',
    'Points à cadrer:',
    ...(quality.warnings?.length ? quality.warnings.map((item) => `- ${item}`) : ['- Aucun']),
    '',
    'Éléments prêts:',
    ...(quality.ready?.length ? quality.ready.map((item) => `- ${item}`) : ['- Aucun']),
    '',
    'Brief projet:',
    '',
    payload.brief || '',
  ]
  return lines.join('\n').trim()
}

async function handle(message) {
  const { id, method, params } = message

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'dstny-cockpit-tools',
          version: '0.1.0',
        },
      },
    }
  }

  if (method === 'notifications/initialized') return null

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools } }
  }

  if (method === 'tools/call') {
    const name = params?.name
    const args = params?.arguments || {}
    if (name === 'dstny_prepare_product_sheet') {
      const payload = await callAgentAction(args)
      return {
        jsonrpc: '2.0',
        id,
        result: textResult(formatActionResult(payload)),
      }
    }
    if (name === 'dstny_review_project') {
      const payload = await callProjectReview(args)
      return {
        jsonrpc: '2.0',
        id,
        result: textResult(formatReviewResult(payload)),
      }
    }
    {
      throw new Error(`Unknown tool: ${name}`)
    }
  }

  if (id === undefined || id === null) return null
  throw new Error(`Unsupported method: ${method}`)
}

let buffer = ''
let pending = 0
let inputEnded = false

function maybeExit() {
  if (inputEnded && pending === 0) process.exit(0)
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  const lines = buffer.split(/\r?\n/)
  buffer = lines.pop() || ''
  for (const line of lines) {
    if (!line.trim()) continue
    pending += 1
    Promise.resolve()
      .then(() => handle(JSON.parse(line)))
      .then((response) => {
        if (response) send(response)
      })
      .catch((error) => {
        let id = null
        try {
          id = JSON.parse(line).id ?? null
        } catch {}
        send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : 'MCP tool failed',
          },
        })
      })
      .finally(() => {
        pending -= 1
        maybeExit()
      })
  }
})

process.stdin.on('end', () => {
  inputEnded = true
  maybeExit()
})
