/**
 * Connection status endpoint — returns a summary of portable chat readiness
 * plus whether Hermes Agent gateway enhancements are available.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import YAML from 'yaml'
import {
  CLAUDE_API,
  ensureGatewayProbed,
  getChatMode,
} from '../../server/gateway-capabilities'
import { isAuthenticated } from '../../server/auth-middleware'

const CONFIG_PATH = path.join(
  process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes'),
  'config.yaml',
)

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
  status: 'connected' | 'enhanced' | 'partial' | 'disconnected'
  label: 'Connected' | 'Enhanced' | 'Partial' | 'Disconnected'
  detail: string
  health: boolean
  chatReady: boolean
  modelConfigured: boolean
  activeModel: string
  chatMode: 'enhanced-claude' | 'portable' | 'disconnected'
  capabilities: Record<string, boolean>
  claudeUrl: string
}

export const Route = createFileRoute('/api/connection-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // isAuthenticated() returns boolean. The previous "return authResult as
        // unknown as Response" cast silenced TypeScript but threw at runtime
        // because the framework received `false`, not a Response. See #261, #263.
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const caps = await ensureGatewayProbed()
        const activeModel = readActiveModel()
        const modelConfigured = Boolean(activeModel)

        const chatReady = caps.chatCompletions
        const enhancedReady =
          chatReady &&
          (caps.dashboard.available || caps.sessions) &&
          caps.skills &&
          caps.config

        let status: ConnectionStatus['status']
        let label: ConnectionStatus['label']
        let detail: string

        if (!caps.health && !chatReady) {
          status = 'disconnected'
          label = 'Disconnected'
          detail = 'No compatible backend detected.'
        } else if (enhancedReady) {
          status = 'enhanced'
          label = 'Enhanced'
          detail = modelConfigured
            ? caps.dashboard.available
              ? 'Core chat works and the Hermes Agent dashboard APIs are available.'
              : 'Core chat works and Hermes Agent gateway APIs are available.'
            : caps.dashboard.available
              ? 'Hermes Agent dashboard APIs are available. Choose a model to start chatting.'
              : 'Hermes Agent gateway APIs are available. Choose a model to start chatting.'
        } else if (chatReady && modelConfigured) {
          status = 'connected'
          label = 'Connected'
          detail = 'Core chat is ready on this backend.'
        } else {
          status = 'partial'
          label = 'Partial'
          if (!chatReady) {
            detail = 'Backend reachable, but chat API is not ready yet.'
          } else if (!modelConfigured) {
            detail =
              'Backend connected. Choose a provider and model to test chat.'
          } else {
            detail =
              'Core chat works. Enhanced Hermes Agent gateway APIs are optional and unlock automatically when available.'
          }
        }

        const body: ConnectionStatus = {
          status,
          label,
          detail,
          health: caps.health,
          chatReady,
          modelConfigured,
          activeModel,
          chatMode: getChatMode(),
          capabilities: {
            health: caps.health,
            chatCompletions: caps.chatCompletions,
            models: caps.models,
            streaming: caps.streaming,
            sessions: caps.sessions,
            skills: caps.skills,
            memory: caps.memory,
            config: caps.config,
            jobs: caps.jobs,
            mcp: caps.mcp,
            conductor: caps.conductor,
            kanban: caps.kanban,
            enhancedChat: caps.enhancedChat,
            dashboard: caps.dashboard.available,
          },
          claudeUrl: CLAUDE_API,
        }

        return Response.json(body)
      },
    },
  },
})
