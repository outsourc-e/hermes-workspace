import { randomBytes, randomUUID } from 'node:crypto'

import type {
  CloudInstance,
  CloudInstanceStatus,
  CloudPlan,
} from '@/lib/cloud-types'

const cloudInstancesByEmail = new Map<string, CloudInstance>()
const subscriptionToEmail = new Map<string, string>()

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const CLOUD_API_URL = process.env.HERMES_CLOUD_API || 'https://cloud.hermesworkspace.app'

function createGatewayUrl(instanceId: string): string {
  return `https://${instanceId}.hermes.mock.hermesworkspace.local`
}

function createGatewayToken(): string {
  return randomBytes(24).toString('hex')
}

function getExpiryDate(plan: CloudPlan): string {
  const expiresAt = new Date()
  const days = plan === 'free' ? 14 : 30
  expiresAt.setDate(expiresAt.getDate() + days)
  return expiresAt.toISOString()
}

/**
 * Provision a cloud instance. When HERMES_CLOUD_API is set, proxies to the
 * real cloud API (PC2 Docker containers). Otherwise falls back to local mock.
 */
export async function provisionCloudInstance(params: {
  email: string
  plan: CloudPlan
  polarSubscriptionId?: string
  expiresAt?: string
}): Promise<CloudInstance> {
  const email = normalizeEmail(params.email)

  // If real cloud API is configured, proxy the request there
  if (CLOUD_API_URL && !CLOUD_API_URL.includes('mock')) {
    try {
      const res = await fetch(`${CLOUD_API_URL}/api/provision/${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = (await res.json()) as { url: string; token: string; plan: string; status: string }
        const instance: CloudInstance = {
          id: randomUUID(),
          email,
          plan: (data.plan as CloudPlan) || params.plan,
          gatewayUrl: data.url,
          token: data.token,
          status: 'active',
          createdAt: new Date().toISOString(),
          expiresAt: params.expiresAt ?? getExpiryDate(params.plan),
          polarSubscriptionId: params.polarSubscriptionId ?? null,
        }
        cloudInstancesByEmail.set(email, instance)
        return instance
      }
      // If user not found on cloud API (hasn't paid yet), fall through to mock
    } catch {
      // Cloud API unreachable, fall through to mock
    }
  }

  // Local mock fallback
  const existing = cloudInstancesByEmail.get(email)
  const now = new Date().toISOString()
  const instanceId = existing?.id ?? randomUUID()

  const instance: CloudInstance = {
    id: instanceId,
    email,
    plan: params.plan,
    gatewayUrl: existing?.gatewayUrl ?? createGatewayUrl(instanceId),
    token: existing?.token ?? createGatewayToken(),
    status: 'active',
    createdAt: existing?.createdAt ?? now,
    expiresAt: params.expiresAt ?? existing?.expiresAt ?? getExpiryDate(params.plan),
    polarSubscriptionId:
      params.polarSubscriptionId ?? existing?.polarSubscriptionId ?? null,
  }

  cloudInstancesByEmail.set(email, instance)

  if (instance.polarSubscriptionId) {
    subscriptionToEmail.set(instance.polarSubscriptionId, email)
  }

  return instance
}

export function getCloudInstanceByEmail(email: string): CloudInstance | undefined {
  return cloudInstancesByEmail.get(normalizeEmail(email))
}

export function getCloudInstanceBySubscriptionId(
  polarSubscriptionId: string,
): CloudInstance | undefined {
  const email = subscriptionToEmail.get(polarSubscriptionId)
  return email ? cloudInstancesByEmail.get(email) : undefined
}

export function updateCloudInstance(
  email: string,
  updates: Partial<Pick<CloudInstance, 'plan' | 'expiresAt' | 'polarSubscriptionId' | 'status'>>,
): CloudInstance | undefined {
  const existing = getCloudInstanceByEmail(email)
  if (!existing) return undefined
  const normalizedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as Partial<
    Pick<CloudInstance, 'plan' | 'expiresAt' | 'polarSubscriptionId' | 'status'>
  >

  const next: CloudInstance = {
    ...existing,
    ...normalizedUpdates,
  }

  cloudInstancesByEmail.set(existing.email, next)

  if (next.polarSubscriptionId) {
    subscriptionToEmail.set(next.polarSubscriptionId, existing.email)
  }

  return next
}

export function suspendCloudInstance(params: {
  email?: string
  polarSubscriptionId?: string
}): CloudInstance | undefined {
  const instance =
    (params.polarSubscriptionId
      ? getCloudInstanceBySubscriptionId(params.polarSubscriptionId)
      : undefined) ??
    (params.email ? getCloudInstanceByEmail(params.email) : undefined)

  if (!instance) return undefined

  return updateCloudInstance(instance.email, {
    status: 'suspended' satisfies CloudInstanceStatus,
  })
}
