import { describe, expect, it } from 'vitest'

import {
  ReservationValidationError,
  confirmReservation,
  countReservations,
  createReservation,
  validateReservationInput,
  type NameReservationStore,
} from './name-reservations'

function makeStore(seed: {
  reservations?: Array<{
    id: string
    desiredName: string
    normalizedName: string
    email: string
    wallet: string | null
    confirmationToken: string
    confirmedAt: string | null
    createdAt: string
  }>
} = {}): NameReservationStore {
  const reservations = [...(seed.reservations || [])]

  return {
    async findByNormalizedName(normalizedName) {
      return reservations.find((entry) => entry.normalizedName === normalizedName) || null
    },
    async insertReservation(input) {
      const created = {
        id: `res_${reservations.length + 1}`,
        desiredName: input.desiredName,
        normalizedName: input.normalizedName,
        email: input.email,
        wallet: input.wallet,
        confirmationToken: input.confirmationToken,
        confirmedAt: null,
        createdAt: '2026-05-06T12:00:00.000Z',
      }
      reservations.push(created)
      return created
    },
    async countReservations() {
      return reservations.length
    },
    async confirmByToken(token) {
      const found = reservations.find((entry) => entry.confirmationToken === token)
      if (!found) return null
      if (!found.confirmedAt) {
        found.confirmedAt = '2026-05-06T12:05:00.000Z'
      }
      return found
    },
  }
}

describe('validateReservationInput', () => {
  it('accepts valid names, emails, and optional wallets', () => {
    expect(
      validateReservationInput({
        desiredName: 'Guild_Mage_7',
        email: 'player@example.com',
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
      }),
    ).toEqual({
      desiredName: 'Guild_Mage_7',
      normalizedName: 'guild_mage_7',
      email: 'player@example.com',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
    })
  })

  it('rejects invalid names before touching storage', () => {
    expect(() =>
      validateReservationInput({
        desiredName: 'bad name',
        email: 'player@example.com',
        wallet: '',
      }),
    ).toThrowError(ReservationValidationError)
  })
})

describe('createReservation', () => {
  it('rejects profanity, reserved names, and duplicates', async () => {
    const duplicateStore = makeStore({
      reservations: [
        {
          id: 'res_1',
          desiredName: 'Atlas',
          normalizedName: 'atlas',
          email: 'atlas@example.com',
          wallet: null,
          confirmationToken: 'tok_existing',
          confirmedAt: null,
          createdAt: '2026-05-06T12:00:00.000Z',
        },
      ],
    })

    await expect(
      createReservation(
        {
          desiredName: 'admin',
          email: 'player@example.com',
          wallet: null,
        },
        {
          store: duplicateStore,
          sendConfirmationEmail: async () => {},
          now: () => new Date('2026-05-06T12:00:00.000Z'),
          randomToken: () => 'tok_1',
        },
      ),
    ).rejects.toThrow('reserved')

    await expect(
      createReservation(
        {
          desiredName: 'shitmage',
          email: 'player@example.com',
          wallet: null,
        },
        {
          store: duplicateStore,
          sendConfirmationEmail: async () => {},
          now: () => new Date('2026-05-06T12:00:00.000Z'),
          randomToken: () => 'tok_2',
        },
      ),
    ).rejects.toThrow('profanity')

    await expect(
      createReservation(
        {
          desiredName: 'Atlas',
          email: 'new@example.com',
          wallet: null,
        },
        {
          store: duplicateStore,
          sendConfirmationEmail: async () => {},
          now: () => new Date('2026-05-06T12:00:00.000Z'),
          randomToken: () => 'tok_3',
        },
      ),
    ).rejects.toThrow('already reserved')
  })

  it('stores a pending reservation and sends a confirmation email', async () => {
    const store = makeStore()
    const sent: Array<{ email: string; desiredName: string; confirmationUrl: string }> = []

    const created = await createReservation(
      {
        desiredName: 'AgoraScout',
        email: 'scout@example.com',
        wallet: 'solana_wallet_123456',
      },
      {
        store,
        sendConfirmationEmail: async (payload) => {
          sent.push(payload)
        },
        baseUrl: 'https://hermes-world.ai',
        now: () => new Date('2026-05-06T12:00:00.000Z'),
        randomToken: () => 'tok_new',
      },
    )

    expect(created.normalizedName).toBe('agorascout')
    expect(created.confirmationToken).toBe('tok_new')
    expect(sent).toEqual([
      {
        email: 'scout@example.com',
        desiredName: 'AgoraScout',
        confirmationUrl: 'https://hermes-world.ai/reserve/confirm?token=tok_new',
      },
    ])
    await expect(countReservations(store)).resolves.toBe(1)
  })

  it('supports three sequential successful reservations', async () => {
    const store = makeStore()
    const sent: string[] = []
    const attempts = [
      { desiredName: 'AtlasOne', email: 'player1@example.com', token: 'tok_1' },
      { desiredName: 'BeaconTwo', email: 'player2@example.com', token: 'tok_2' },
      { desiredName: 'Cipher_3', email: 'player3@example.com', token: 'tok_3' },
    ]

    for (const attempt of attempts) {
      await createReservation(
        {
          desiredName: attempt.desiredName,
          email: attempt.email,
          wallet: null,
        },
        {
          store,
          sendConfirmationEmail: async (payload) => {
            sent.push(payload.desiredName)
          },
          baseUrl: 'https://hermes-world.ai',
          now: () => new Date('2026-05-06T12:00:00.000Z'),
          randomToken: () => attempt.token,
        },
      )
    }

    expect(sent).toEqual(['AtlasOne', 'BeaconTwo', 'Cipher_3'])
    await expect(countReservations(store)).resolves.toBe(3)
  })
})

describe('confirmReservation', () => {
  it('marks a token as confirmed and returns the reservation', async () => {
    const store = makeStore({
      reservations: [
        {
          id: 'res_1',
          desiredName: 'OraclePath',
          normalizedName: 'oraclepath',
          email: 'oracle@example.com',
          wallet: null,
          confirmationToken: 'tok_confirm',
          confirmedAt: null,
          createdAt: '2026-05-06T12:00:00.000Z',
        },
      ],
    })

    const confirmed = await confirmReservation('tok_confirm', store)
    expect(confirmed?.confirmedAt).toBe('2026-05-06T12:05:00.000Z')
  })
})
