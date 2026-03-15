import { randomUUID } from 'node:crypto'

export type GatewayFrame =
  | { type: 'req'; id: string; method: string; params?: unknown }
  | {
      type: 'res'
      id: string
      ok: boolean
      payload?: unknown
      error?: { code: string; message: string; details?: unknown }
    }
  | { type: 'event'; event: string; payload?: unknown; seq?: number }
  | {
      type: 'evt'
      event: string
      payload?: unknown
      payloadJSON?: string
      seq?: number
    }

type ConnectParams = {
  minProtocol: number
  maxProtocol: number
  client: {
    id: string
    displayName?: string
    version: string
    platform: string
    mode: string
    instanceId?: string
  }
  auth?: { token?: string; password?: string }
  role?: 'operator' | 'node'
  scopes?: Array<string>
  device?: {
    id: string
    publicKey: string
    signature: string
    signedAt: number
    nonce?: string
  }
}

export function getGatewayConfig() {
  const baseUrl = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'
  const url = baseUrl.replace(/^http/, 'ws')
  return { url, token: '', password: '' }
}

export function buildConnectParams(
  token: string,
  password: string,
  nonce?: string,
): ConnectParams {
  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'hermes-workspace',
      displayName: 'hermes-workspace',
      version: 'stub',
      platform: process.platform,
      mode: 'ui',
      instanceId: randomUUID(),
    },
    auth: {
      token: token || undefined,
      password: password || undefined,
    },
    role: 'operator',
    scopes: [],
    device: {
      id: 'hermes-workspace',
      publicKey: '',
      signature: '',
      signedAt: Date.now(),
      nonce,
    },
  }
}

export type GatewayEventHandler = (frame: GatewayFrame) => void

export async function gatewayRpc<TPayload = unknown>(
  _method: string,
  _params?: unknown,
): Promise<TPayload> {
  return Promise.reject(new Error('Not available'))
}

export function onGatewayEvent(_handler: GatewayEventHandler): () => void {
  return () => {}
}

export async function gatewayConnectCheck(): Promise<void> {
  return Promise.resolve()
}

export async function gatewayReconnect(): Promise<void> {
  return Promise.resolve()
}
