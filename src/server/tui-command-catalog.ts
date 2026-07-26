import WebSocket from 'ws'

import {
  CLAUDE_DASHBOARD_URL,
  dashboardFetch,
  getDashboardToken,
} from './gateway-capabilities'
import type { RawData } from 'ws'

const COMMAND_CATALOG_TIMEOUT_MS = 5_000

type JsonRpcResponse = {
  id?: unknown
  result?: unknown
  error?: { message?: unknown }
}

type CommandCatalogPayload = {
  pairs?: unknown
}

export type SlashCommandDefinition = {
  command: string
  description: string
}

export function normalizeSlashCommandCatalog(
  payload: CommandCatalogPayload,
): Array<SlashCommandDefinition> {
  if (!Array.isArray(payload.pairs)) return []

  const commands: Array<SlashCommandDefinition> = []
  const seen = new Set<string>()

  for (const pair of payload.pairs) {
    if (!Array.isArray(pair)) continue
    const [rawCommand, rawDescription] = pair
    if (typeof rawCommand !== 'string') continue

    const command = rawCommand.trim()
    if (!command.startsWith('/') || command.length === 1 || seen.has(command)) {
      continue
    }

    seen.add(command)
    commands.push({
      command,
      description:
        typeof rawDescription === 'string' && rawDescription.trim()
          ? rawDescription.trim()
          : 'Run command',
    })
  }

  return commands
}

export function buildTuiGatewayWebSocketUrl(
  dashboardUrl: string,
  credential: { kind: 'ticket' | 'token'; value: string },
): string {
  const url = new URL(dashboardUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/ws`
  url.search = ''
  url.searchParams.set(credential.kind, credential.value)
  return url.toString()
}

async function getWebSocketCredential(): Promise<{
  kind: 'ticket' | 'token'
  value: string
}> {
  try {
    const response = await dashboardFetch('/api/auth/ws-ticket', {
      method: 'POST',
    })
    if (response.ok) {
      const payload = (await response.json()) as { ticket?: unknown }
      if (typeof payload.ticket === 'string' && payload.ticket.trim()) {
        return { kind: 'ticket', value: payload.ticket.trim() }
      }
    }
  } catch {
    // Loopback dashboards do not use the ticket endpoint. Fall back below.
  }

  const token = await getDashboardToken()
  if (!token) {
    throw new Error('Dashboard session token is unavailable')
  }
  return { kind: 'token', value: token }
}

function requestCommandCatalog(
  socket: WebSocket,
  requestId: string,
): Promise<CommandCatalogPayload> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      finish(new Error('Timed out reading the Hermes command catalog'))
    }, COMMAND_CATALOG_TIMEOUT_MS)

    const finish = (error?: Error, payload?: CommandCatalogPayload) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.removeListener('error', onError)
      socket.removeListener('message', onMessage)
      socket.removeListener('open', onOpen)
      socket.close()
      if (error) {
        reject(error)
      } else {
        resolve(payload ?? {})
      }
    }

    const onError = (error: Error) => finish(error)
    const onOpen = () => {
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'commands.catalog',
          params: {},
        }),
        (error) => {
          if (error) finish(error)
        },
      )
    }
    const onMessage = (data: RawData) => {
      let response: JsonRpcResponse
      try {
        response = JSON.parse(data.toString()) as JsonRpcResponse
      } catch {
        return
      }
      if (response.id !== requestId) return
      if (response.error) {
        const message =
          typeof response.error.message === 'string'
            ? response.error.message
            : 'Hermes rejected the command catalog request'
        finish(new Error(message))
        return
      }
      if (!response.result || typeof response.result !== 'object') {
        finish(new Error('Hermes returned an invalid command catalog'))
        return
      }
      finish(undefined, response.result as CommandCatalogPayload)
    }

    socket.once('error', onError)
    socket.once('open', onOpen)
    socket.on('message', onMessage)
  })
}

export async function getTuiCommandCatalog(): Promise<
  Array<SlashCommandDefinition>
> {
  const credential = await getWebSocketCredential()
  const url = buildTuiGatewayWebSocketUrl(CLAUDE_DASHBOARD_URL, credential)
  const requestId = `workspace-command-catalog-${crypto.randomUUID()}`
  const socket = new WebSocket(url, {
    origin: new URL(CLAUDE_DASHBOARD_URL).origin,
  })
  const payload = await requestCommandCatalog(socket, requestId)
  const commands = normalizeSlashCommandCatalog(payload)

  if (commands.length === 0) {
    throw new Error('Hermes returned an empty command catalog')
  }

  return commands
}
