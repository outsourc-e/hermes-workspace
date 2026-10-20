import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
} from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'

type DeviceIdentity = {
  deviceId: string
  publicKey: string
  privateKeyPem: string
}

type GatewayFrame = {
  type?: string
  id?: string
  event?: string
  ok?: boolean
  payload?: unknown
  error?: { message?: string; code?: string }
}

const SCOPES = [
  'operator.admin',
  'operator.read',
  'operator.write',
  'operator.approvals',
  'operator.pairing',
]

function identityPath(): string {
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'hermes-workspace',
      'openclaw-device.json',
    )
  }
  return join(homedir(), '.hermes-workspace', 'openclaw-device.json')
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

async function readOrCreateIdentity(): Promise<DeviceIdentity> {
  const target = identityPath()
  try {
    const parsed = JSON.parse(await readFile(target, 'utf8')) as DeviceIdentity
    if (parsed.deviceId && parsed.publicKey && parsed.privateKeyPem) return parsed
  } catch {
    // Create a stable device identity below.
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const spki = publicKey.export({ type: 'spki', format: 'der' })
  const rawPublicKey = spki.subarray(spki.length - 32)
  const identity = {
    deviceId: createHash('sha256').update(rawPublicKey).digest('hex'),
    publicKey: base64Url(rawPublicKey),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(identity), { mode: 0o600 })
  return identity
}

function originForGateway(gatewayUrl: string): string {
  const parsed = new URL(gatewayUrl)
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:'
  return parsed.origin
}

export async function requestOpenClaw<T>(
  gatewayUrl: string,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<T> {
  const identity = await readOrCreateIdentity()

  return new Promise<T>((resolve, reject) => {
    const socket = new WebSocket(gatewayUrl, {
      origin: originForGateway(gatewayUrl),
    })
    const connectRequestId = randomUUID()
    const operationRequestId = randomUUID()
    let settled = false
    const finish = (error?: Error, value?: T) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.close()
      if (error) reject(error)
      else resolve(value as T)
    }
    const timeout = setTimeout(
      () => finish(new Error(`OpenClaw ${method} timed out`)),
      timeoutMs,
    )

    socket.on('message', (buffer) => {
      let frame: GatewayFrame
      try {
        frame = JSON.parse(String(buffer)) as GatewayFrame
      } catch {
        return
      }

      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        const challenge = frame.payload as { nonce?: unknown }
        const nonce =
          typeof challenge.nonce === 'string' ? challenge.nonce : ''
        if (!nonce) {
          finish(new Error('OpenClaw returned an invalid challenge'))
          return
        }
        const signedAt = Date.now()
        const signaturePayload = [
          'v2',
          identity.deviceId,
          'openclaw-control-ui',
          'webchat',
          'operator',
          SCOPES.join(','),
          String(signedAt),
          '',
          nonce,
        ].join('|')
        const signature = sign(
          null,
          Buffer.from(signaturePayload),
          identity.privateKeyPem,
        )
        socket.send(
          JSON.stringify({
            type: 'req',
            id: connectRequestId,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'openclaw-control-ui',
                version: 'hermes-workspace',
                platform: process.platform,
                mode: 'webchat',
                instanceId: randomUUID(),
              },
              role: 'operator',
              scopes: SCOPES,
              device: {
                id: identity.deviceId,
                publicKey: identity.publicKey,
                signature: base64Url(signature),
                signedAt,
                nonce,
              },
              caps: ['tool-events'],
              userAgent: 'Hermes Workspace',
              locale: 'en-US',
            },
          }),
        )
        return
      }

      if (frame.type === 'res' && frame.id === connectRequestId) {
        if (!frame.ok) {
          finish(
            new Error(
              frame.error?.message || 'OpenClaw device connection failed',
            ),
          )
          return
        }
        socket.send(
          JSON.stringify({
            type: 'req',
            id: operationRequestId,
            method,
            params,
          }),
        )
        return
      }

      if (frame.type === 'res' && frame.id === operationRequestId) {
        if (!frame.ok) {
          finish(
            new Error(frame.error?.message || `OpenClaw ${method} failed`),
          )
          return
        }
        finish(undefined, frame.payload as T)
      }
    })
    socket.on('error', (error) => finish(error))
  })
}
