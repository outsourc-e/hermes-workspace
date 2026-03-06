export type CloudPlan = 'free' | 'pro' | 'team'

export type CloudInstanceStatus = 'active' | 'suspended'

export interface CloudInstance {
  id: string
  email: string
  plan: CloudPlan
  gatewayUrl: string
  token: string
  status: CloudInstanceStatus
  createdAt: string
  expiresAt: string
  polarSubscriptionId: string | null
}

export interface PolarWebhookEvent {
  type: 'subscription.created' | 'subscription.canceled' | 'subscription.updated' | string
  data?: {
    id?: string
    email?: string
    plan?: CloudPlan | string
    status?: string
    currentPeriodEnd?: string
    current_period_end?: string
    customer?: {
      email?: string
    }
    subscription?: {
      id?: string
      status?: string
      currentPeriodEnd?: string
      current_period_end?: string
      metadata?: Record<string, unknown>
      customer?: {
        email?: string
      }
    }
    metadata?: Record<string, unknown>
  }
}

export interface CloudProvisionRequest {
  email: string
  plan: CloudPlan
  polarSubscriptionId?: string
}
