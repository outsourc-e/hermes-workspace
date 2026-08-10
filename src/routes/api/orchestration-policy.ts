import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  clearSessionOrchestrationPolicy,
  getOrchestrationPolicy,
  getSessionOrchestrationPolicy,
  saveSessionOrchestrationPolicy,
} from '../../server/orchestration-policy'
import {
  applyGlobalOrchestrationPolicyTransaction,
  serializeOrchestrationWrite,
} from '../../server/orchestration-hermes-sync'
import { loadSubscriptionCatalog } from '../../server/subscription-model-catalog'

const PatchBody = z.object({
  scope: z.enum(['global', 'session']),
  sessionKey: z.string().trim().min(1).optional(),
  patch: z.record(z.string(), z.unknown()),
  confirmApiBilling: z.boolean().optional(),
})

function authorize(request: Request): Response | true {
  if (requireLocalOrAuth(request)) return true
  return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

async function getPolicy({ request }: { request: Request }): Promise<Response> {
  const auth = await authorize(request)
  if (auth !== true) return auth
  const sessionKey =
    new URL(request.url).searchParams.get('sessionKey')?.trim() || ''
  const global = getOrchestrationPolicy()
  return Response.json({
    ok: true,
    global,
    effective: sessionKey ? getSessionOrchestrationPolicy(sessionKey) : global,
    sessionKey: sessionKey || null,
  })
}

async function patchPolicy({
  request,
}: {
  request: Request
}): Promise<Response> {
  const auth = await authorize(request)
  if (auth !== true) return auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = PatchBody.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid orchestration policy patch',
        issues: parsed.error.issues,
      },
      { status: 400 },
    )
  }

  try {
    const catalog = await loadSubscriptionCatalog()
    const isSession = parsed.data.scope === 'session'
    if (isSession) {
      const policy = await serializeOrchestrationWrite(() =>
        saveSessionOrchestrationPolicy(
          parsed.data.sessionKey || '',
          parsed.data.patch,
          { catalog },
        ),
      )
      return Response.json({ ok: true, policy })
    }

    const policy = await applyGlobalOrchestrationPolicyTransaction(
      parsed.data.patch,
      {
        catalog,
        confirmApiBilling: parsed.data.confirmApiBilling,
      },
    )
    return Response.json({ ok: true, policy })
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'Unable to apply orchestration policy',
      },
      { status: 400 },
    )
  }
}

async function deletePolicy({
  request,
}: {
  request: Request
}): Promise<Response> {
  const auth = await authorize(request)
  if (auth !== true) return auth
  const sessionKey =
    new URL(request.url).searchParams.get('sessionKey')?.trim() || ''
  if (!sessionKey) {
    return Response.json(
      { ok: false, error: 'sessionKey is required' },
      { status: 400 },
    )
  }
  await serializeOrchestrationWrite(() =>
    clearSessionOrchestrationPolicy(sessionKey),
  )
  return Response.json({ ok: true, policy: getOrchestrationPolicy() })
}

export const Route = createFileRoute('/api/orchestration-policy')({
  server: {
    handlers: {
      GET: getPolicy,
      PATCH: patchPolicy,
      POST: patchPolicy,
      DELETE: deletePolicy,
    },
  },
})
