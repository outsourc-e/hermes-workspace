const NAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WALLET_PATTERN = /^[A-Za-z0-9:_-]{6,120}$/

const DEFAULT_RESERVED_NAMES = [
  'admin',
  'administrator',
  'system',
  'support',
  'moderator',
  'mod',
  'gm',
  'hermes',
  'apollo',
  'athena',
  'root',
]

const PROFANITY_TOKENS = [
  'shit',
  'fuck',
  'bitch',
  'cunt',
  'nigger',
  'fag',
  'slut',
  'whore',
]

export class ReservationValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ReservationValidationError'
    this.status = status
  }
}

export type ReservationInput = {
  desiredName: string
  email: string
  wallet?: string | null
}

export type ValidatedReservationInput = {
  desiredName: string
  normalizedName: string
  email: string
  wallet: string | null
}

export type NameReservationRecord = {
  id: string
  desiredName: string
  normalizedName: string
  email: string
  wallet: string | null
  confirmationToken: string
  confirmedAt: string | null
  createdAt: string
}

export type NameReservationStore = {
  findByNormalizedName(normalizedName: string): Promise<NameReservationRecord | null>
  insertReservation(input: {
    desiredName: string
    normalizedName: string
    email: string
    wallet: string | null
    confirmationToken: string
    createdAt: string
  }): Promise<NameReservationRecord>
  countReservations(): Promise<number>
  confirmByToken(token: string): Promise<NameReservationRecord | null>
}

export type ConfirmationEmailPayload = {
  email: string
  desiredName: string
  confirmationUrl: string
}

export function normalizeReservationName(value: string): string {
  return value.trim().toLowerCase()
}

function getReservedNames(): Set<string> {
  const extra = (process.env.HERMESWORLD_RESERVED_NAMES || '')
    .split(',')
    .map((value) => normalizeReservationName(value))
    .filter(Boolean)
  return new Set([...DEFAULT_RESERVED_NAMES, ...extra].map(normalizeReservationName))
}

function containsProfanity(normalizedName: string): boolean {
  return PROFANITY_TOKENS.some((token) => normalizedName.includes(token))
}

export function validateReservationInput(input: ReservationInput): ValidatedReservationInput {
  const desiredName = input.desiredName.trim()
  const normalizedName = normalizeReservationName(desiredName)
  const email = input.email.trim().toLowerCase()
  const wallet = (input.wallet || '').trim()

  if (!NAME_PATTERN.test(desiredName)) {
    throw new ReservationValidationError(
      'Desired name must be 3-20 characters and use only letters, numbers, or underscores.',
    )
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new ReservationValidationError('Enter a valid email address.')
  }

  if (wallet && !WALLET_PATTERN.test(wallet)) {
    throw new ReservationValidationError('Wallet format looks invalid.')
  }

  return {
    desiredName,
    normalizedName,
    email,
    wallet: wallet || null,
  }
}

export function assertNameAllowed(normalizedName: string): void {
  if (getReservedNames().has(normalizedName)) {
    throw new ReservationValidationError('That name is reserved for admin/system use.', 409)
  }

  if (containsProfanity(normalizedName)) {
    throw new ReservationValidationError('That name fails the profanity filter.', 409)
  }
}

export async function createReservation(
  input: ReservationInput,
  options: {
    store: NameReservationStore
    sendConfirmationEmail: (payload: ConfirmationEmailPayload) => Promise<void>
    baseUrl?: string
    now?: () => Date
    randomToken?: () => string
  },
): Promise<NameReservationRecord> {
  const validated = validateReservationInput(input)
  assertNameAllowed(validated.normalizedName)

  const existing = await options.store.findByNormalizedName(validated.normalizedName)
  if (existing) {
    throw new ReservationValidationError('That name is already reserved.', 409)
  }

  const token =
    options.randomToken?.() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`)
  const now = options.now?.() || new Date()
  const baseUrl = (options.baseUrl || process.env.HERMESWORLD_RESERVE_BASE_URL || 'https://hermes-world.ai').replace(/\/$/, '')

  const record = await options.store.insertReservation({
    ...validated,
    confirmationToken: token,
    createdAt: now.toISOString(),
  })

  await options.sendConfirmationEmail({
    email: validated.email,
    desiredName: validated.desiredName,
    confirmationUrl: `${baseUrl}/reserve/confirm?token=${encodeURIComponent(token)}`,
  })

  return record
}

export async function confirmReservation(
  token: string,
  store: NameReservationStore,
): Promise<NameReservationRecord | null> {
  const normalizedToken = token.trim()
  if (!normalizedToken) {
    throw new ReservationValidationError('Confirmation token is required.')
  }
  return store.confirmByToken(normalizedToken)
}

export async function countReservations(store: NameReservationStore): Promise<number> {
  return store.countReservations()
}

type SupabaseReservationRow = {
  id: string
  desired_name: string
  normalized_name: string
  email: string
  wallet_address: string | null
  confirmation_token: string
  confirmed_at: string | null
  created_at: string
}

function requireEnv(name: string): string {
  const value = (process.env[name] || '').trim()
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function mapSupabaseRow(row: SupabaseReservationRow): NameReservationRecord {
  return {
    id: row.id,
    desiredName: row.desired_name,
    normalizedName: row.normalized_name,
    email: row.email,
    wallet: row.wallet_address,
    confirmationToken: row.confirmation_token,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  }
}

async function supabaseRequest(path: string, init: RequestInit): Promise<Response> {
  const url = requireEnv('HERMESWORLD_SUPABASE_URL').replace(/\/$/, '')
  const key = requireEnv('HERMESWORLD_SUPABASE_SERVICE_ROLE_KEY')
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
}

export function createSupabaseReservationStore(): NameReservationStore {
  return {
    async findByNormalizedName(normalizedName) {
      const response = await supabaseRequest(
        `name_reservations?normalized_name=eq.${encodeURIComponent(normalizedName)}&select=*`,
        { method: 'GET', headers: { prefer: '' } },
      )
      if (!response.ok) {
        throw new Error(`Failed to query reservations (${response.status})`)
      }
      const rows = (await response.json()) as Array<SupabaseReservationRow>
      return rows[0] ? mapSupabaseRow(rows[0]) : null
    },
    async insertReservation(input) {
      const response = await supabaseRequest('name_reservations', {
        method: 'POST',
        body: JSON.stringify({
          desired_name: input.desiredName,
          normalized_name: input.normalizedName,
          email: input.email,
          wallet_address: input.wallet,
          confirmation_token: input.confirmationToken,
          created_at: input.createdAt,
        }),
      })
      if (!response.ok) {
        const text = await response.text()
        if (response.status === 409 || text.includes('duplicate key')) {
          throw new ReservationValidationError('That name is already reserved.', 409)
        }
        throw new Error(`Failed to create reservation (${response.status}): ${text}`)
      }
      const rows = (await response.json()) as Array<SupabaseReservationRow>
      return mapSupabaseRow(rows[0])
    },
    async countReservations() {
      const response = await supabaseRequest('name_reservations?select=id', {
        method: 'GET',
        headers: { prefer: 'count=exact', range: '0-0' },
      })
      if (!response.ok) {
        throw new Error(`Failed to count reservations (${response.status})`)
      }
      const contentRange = response.headers.get('content-range') || ''
      const total = Number(contentRange.split('/')[1] || '0')
      return Number.isFinite(total) ? total : 0
    },
    async confirmByToken(token) {
      const response = await supabaseRequest(
        `name_reservations?confirmation_token=eq.${encodeURIComponent(token)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
        },
      )
      if (!response.ok) {
        throw new Error(`Failed to confirm reservation (${response.status})`)
      }
      const rows = (await response.json()) as Array<SupabaseReservationRow>
      return rows[0] ? mapSupabaseRow(rows[0]) : null
    },
  }
}

export async function sendReservationConfirmationEmail(
  payload: ConfirmationEmailPayload,
): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  const from = (process.env.RESERVE_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '').trim()
  if (!apiKey || !from) {
    throw new Error('Email delivery is not configured (missing RESEND_API_KEY or RESERVE_FROM_EMAIL).')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.email],
      subject: `Confirm your HermesWorld name reservation: ${payload.desiredName}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827">
  <h2>Confirm your HermesWorld reservation</h2>
  <p>You asked to reserve <strong>${payload.desiredName}</strong>.</p>
  <p>Confirm it here:</p>
  <p><a href="${payload.confirmationUrl}">${payload.confirmationUrl}</a></p>
  <p>If this wasn't you, ignore this email.</p>
</div>`,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to send confirmation email (${response.status}): ${text}`)
  }
}
