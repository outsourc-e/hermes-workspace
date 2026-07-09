import {
  createNovaFabricReviewProposal,
  getNovaFabricSnapshot,
} from './nova-fabric-store'

/**
 * Universal approval governance for Mission Control.
 *
 * Every category listed here requires Taylor approval before any agent may
 * act, and approval is only ever proven by a server-side fabric review in
 * status 'approved' — never by a browser boolean, request body flag, or
 * client-side state.
 */
export const GOVERNED_ACTION_CATEGORIES = [
  'external-message',
  'spending',
  'customer-vendor',
  'jobboard-write',
  'github-risky',
  'provider-config',
  'credentials',
  'destructive',
  'nova-self-state',
] as const

export type GovernedActionCategory = (typeof GOVERNED_ACTION_CATEGORIES)[number]

export type GovernancePolicyEntry = {
  label: string
  description: string
  requiresApproval: true
  examples: Array<string>
}

const POLICY: Record<GovernedActionCategory, GovernancePolicyEntry> = {
  'external-message': {
    label: 'External messages',
    description: 'Email, SMS, chat, or any message leaving the machine.',
    requiresApproval: true,
    examples: ['send email', 'send SMS', 'post to Telegram/Discord'],
  },
  spending: {
    label: 'Spending',
    description: 'Any action that costs money or commits funds.',
    requiresApproval: true,
    examples: ['purchase API credits', 'place an order'],
  },
  'customer-vendor': {
    label: 'Customer/vendor-facing',
    description: 'Anything a Neon Moon customer or vendor could see.',
    requiresApproval: true,
    examples: ['reply to a customer', 'update a vendor portal'],
  },
  'jobboard-write': {
    label: 'Printavo/job-board writes',
    description:
      'Mutations to the Neon Moon job board or Printavo. Reads are free; state.json is never touched directly.',
    requiresApproval: true,
    examples: ['move a kanban card', 'update job status'],
  },
  'github-risky': {
    label: 'GitHub risky ops',
    description: 'Force pushes, merges to protected branches, releases, deletions.',
    requiresApproval: true,
    examples: ['merge PR to main', 'force push', 'delete branch'],
  },
  'provider-config': {
    label: 'Provider/config changes',
    description: 'Model routing, gateway config, or provider account changes.',
    requiresApproval: true,
    examples: ['switch default model', 'edit gateway config'],
  },
  credentials: {
    label: 'Logins/secrets',
    description:
      'Anything touching credentials. Secrets live in 1Password/Credential Manager and are never displayed.',
    requiresApproval: true,
    examples: ['rotate a token', 'add an OAuth grant'],
  },
  destructive: {
    label: 'Destructive ops',
    description: 'Deletes, overwrites of files not created this task, resets.',
    requiresApproval: true,
    examples: ['delete data', 'reset a store'],
  },
  'nova-self-state': {
    label: 'Protected Nova self-state',
    description: 'Identity, boundary, or embodiment changes to Nova herself.',
    requiresApproval: true,
    examples: ['change persona', 'alter protected wants'],
  },
}

export function getGovernancePolicy(): Record<
  GovernedActionCategory,
  GovernancePolicyEntry
> {
  return POLICY
}

export type GovernedActionVerdict = {
  allowed: boolean
  category: GovernedActionCategory
  action: string
  reason: string
  reviewId: string | null
}

/**
 * Pure server-side check: a governed action is allowed only when it names a
 * fabric review that exists and was approved through the server-side status
 * flow. No fabric write happens here — callers that want a boundary receipt
 * for a refused action should use recordBlockedExternalAction.
 */
export function evaluateGovernedAction(input: {
  category: GovernedActionCategory
  action: string
  target?: string
  approvedReviewId?: string | null
}): GovernedActionVerdict {
  const base = {
    category: input.category,
    action: input.action,
    reviewId: null as string | null,
  }

  if (!input.approvedReviewId) {
    return {
      ...base,
      allowed: false,
      reason: `${POLICY[input.category].label} require Taylor approval — no approval receipt was provided`,
    }
  }

  const snapshot = getNovaFabricSnapshot()
  if (!snapshot.ok) {
    return {
      ...base,
      allowed: false,
      reason: 'Fabric store unreadable — approvals cannot be verified, refusing',
    }
  }

  const review = snapshot.fabric.reviewQueue.find(
    (item) => item.id === input.approvedReviewId,
  )
  if (!review) {
    return {
      ...base,
      allowed: false,
      reason: `Approval receipt ${input.approvedReviewId} not found in the fabric review queue`,
    }
  }
  if (review.status !== 'approved') {
    return {
      ...base,
      allowed: false,
      reason: `Review ${review.id} is ${review.status === 'pending' ? 'still pending' : review.status} — only a server-side approved review authorizes this`,
    }
  }

  // Scope binding: an approval is only valid for the exact category+action it
  // was proposed for. Without this, ANY approved review id (say, a harmless
  // vault cleanup) could be replayed to authorize spending or an email send.
  const diff = review.proposedDiff as Record<string, unknown>
  const approvedCategory =
    typeof diff.governedCategory === 'string' ? diff.governedCategory : null
  const approvedAction = typeof diff.action === 'string' ? diff.action : null
  if (approvedCategory !== input.category || approvedAction !== input.action) {
    return {
      ...base,
      allowed: false,
      reason: `Review ${review.id} does not cover this action — it approved ${approvedCategory ?? 'no governed category'} / ${approvedAction ?? 'no action'}, not ${input.category} / ${input.action}`,
    }
  }

  return {
    ...base,
    allowed: true,
    reviewId: review.id,
    reason: `Approved via fabric review ${review.id}`,
  }
}

/**
 * Creates the correctly-scoped fabric review for a governed action. The
 * resulting review (once Taylor approves it) is the ONLY thing
 * evaluateGovernedAction will accept for this exact category+action pair.
 */
export function proposeGovernedAction(input: {
  category: GovernedActionCategory
  action: string
  target?: string
  reason: string
}) {
  return createNovaFabricReviewProposal({
    title: `Governed action: ${input.action}`,
    reason: input.reason,
    targetType: 'source-map',
    proposedDiff: {
      governedCategory: input.category,
      action: input.action,
      ...(input.target ? { target: input.target } : {}),
    },
    provenance: 'Mission Control approval governance',
    riskLevel: 'high',
  })
}
