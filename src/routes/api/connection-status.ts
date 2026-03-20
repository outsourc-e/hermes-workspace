/**
 * Connection status endpoint — returns a summary of gateway capability state
 * for the client-side connection indicator.
 *
 * Status meanings:
 *   connected  — backend health OK + a model is configured
 *   partial    — backend healthy but model not configured or jobs API missing
 *   disconnected — backend health check failed
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  HERMES_API,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import YAML from 'yaml'

const CONFIG_PATH = path.join(os.homedir(), '.hermes', 'config.yaml')

function readActiveModel(): string {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const config = (YAML.parse(raw) as Record<string, unknown>) || {}
    const modelField = config.model
    if (typeof modelField === 'string') return modelField
    if (modelField && typeof modelField === 'object') {
      const obj = modelField as Record<string, unknown>
      return (obj.default as string) || ''
    }
  } catch {
    // config missing or unreadable
  }
  return ''
}

type ConnectionStatus = {
  status: 'connected' | 'partial' | 'disconnected'
  health: boolean
  modelConfigured: boolean
  activeModel: string
  capabilities: Record<string, boolean>
  hermesUrl: string
}

export const Route = createFileRoute('/api/connection-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authResult = isAuthenticated(request)
        if (authResult !== true) return authResult as unknown as Response

        const caps = await ensureGatewayProbed()
        const activeModel = readActiveModel()
        const modelConfigured = Boolean(activeModel)

        let status: ConnectionStatus['status']
        if (!caps.health) {
          status = 'disconnected'
        } else if (!modelConfigured || !caps.jobs) {
          status = 'partial'
        } else {
          status = 'connected'
        }

        const body: ConnectionStatus = {
          status,
          health: caps.health,
          modelConfigured,
          activeModel,
          capabilities: {
            health: caps.health,
            models: caps.models,
            sessions: caps.sessions,
            skills: caps.skills,
            memory: caps.memory,
            config: caps.config,
            jobs: caps.jobs,
          },
          hermesUrl: HERMES_API,
        }

        return Response.json(body)
      },
    },
  },
})
