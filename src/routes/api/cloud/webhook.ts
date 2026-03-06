import { createHmac, timingSafeEqual } from 'node:crypto'

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import {
  provisionCloudInstance,
  suspendCloudInstance,
  updateCloudInstance,
} from '@/lib/cloud-store'
import type { CloudPlan, PolarWebhookEvent } from '@/lib/cloud-types'
import { requireJsonContentType } from '@/server/rate-limit'

function normalizePlan(plan: unknown): CloudPlan {
  return plan === 'team' || plan === 'free' ? plan : 'pro'
}

function timingSafeMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function isValidPolarSignature(rawBody: string, signature: string, secret: string): boolean {
  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex')
  const expectedBase64 = createHmac('sha256', secret).update(rawBody).digest('base64')
  const normalized = signature.trim()
  const candidates = normalized
    .split(',')
    .map((value) => value.trim())
    .flatMap((value) => {
      if (value.startsWith('sha256=')) return [value.slice('sha256='.length)]
      if (value.startsWith('v1=')) return [value.slice('v1='.length)]
      return [value]
    })

  return candidates.some(
    (candidate) =>
      timingSafeMatch(candidate, expectedHex) ||
      timingSafeMatch(candidate, expectedBase64),
  )
}

function extractEmail(event: PolarWebhookEvent): string | undefined {
  return (
    event.data?.subscription?.customer?.email ??
    event.data?.customer?.email ??
    event.data?.email
  )
}

function extractSubscriptionId(event: PolarWebhookEvent): string | undefined {
  return event.data?.subscription?.id ?? event.data?.id
}

function extractPlan(event: PolarWebhookEvent): CloudPlan {
  const metadataPlan =
    event.data?.subscription?.metadata?.plan ??
    event.data?.metadata?.plan ??
    event.data?.plan

  return normalizePlan(metadataPlan)
}

function extractExpiry(event: PolarWebhookEvent): string | undefined {
  return (
    event.data?.subscription?.currentPeriodEnd ??
    event.data?.subscription?.current_period_end ??
    event.data?.currentPeriodEnd ??
    event.data?.current_period_end
  )
}

export const Route = createFileRoute('/api/cloud/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const signature = request.headers.get('X-Polar-Signature')
        const secret = process.env.POLAR_WEBHOOK_SECRET

        if (!signature || !secret) {
          return json({ ok: false, error: 'Webhook secret or signature missing' }, { status: 403 })
        }

        const rawBody = await request.text()
        if (!isValidPolarSignature(rawBody, signature, secret)) {
          return json({ ok: false, error: 'Invalid webhook signature' }, { status: 403 })
        }

        let event: PolarWebhookEvent
        try {
          event = JSON.parse(rawBody) as PolarWebhookEvent
        } catch {
          return json({ ok: false, error: 'Invalid webhook payload' }, { status: 400 })
        }
        const email = extractEmail(event)
        const polarSubscriptionId = extractSubscriptionId(event)
        const plan = extractPlan(event)
        const expiresAt = extractExpiry(event)

        if (event.type === 'subscription.created') {
          if (!email) {
            return json({ ok: false, error: 'Missing customer email' }, { status: 400 })
          }

          provisionCloudInstance({
            email,
            plan,
            polarSubscriptionId,
            expiresAt,
          })
        }

        if (event.type === 'subscription.canceled') {
          const suspended = suspendCloudInstance({ email, polarSubscriptionId })
          if (!suspended) {
            return json({ ok: false, error: 'Cloud instance not found' }, { status: 404 })
          }
        }

        if (event.type === 'subscription.updated' && email) {
          const existing =
            updateCloudInstance(email, {
              plan,
              expiresAt,
              polarSubscriptionId,
              status: event.data?.subscription?.status === 'canceled' ? 'suspended' : 'active',
            }) ??
            provisionCloudInstance({
              email,
              plan,
              polarSubscriptionId,
              expiresAt,
            })

          if (!existing) {
            return json({ ok: false, error: 'Unable to update cloud instance' }, { status: 500 })
          }
        }

        return json({ ok: true })
      },
    },
  },
})
