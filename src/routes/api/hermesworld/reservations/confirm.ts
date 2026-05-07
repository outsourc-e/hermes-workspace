import { createFileRoute } from '@tanstack/react-router'
import {
  confirmReservation,
  createSupabaseReservationStore,
  ReservationValidationError,
} from '@/server/name-reservations'
import { safeErrorMessage } from '@/server/rate-limit'

export const Route = createFileRoute('/api/hermesworld/reservations/confirm')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { token } = (await request.json()) as { token?: string }
          const store = createSupabaseReservationStore()
          const reservation = await confirmReservation(token || '', store)
          if (!reservation) {
            return Response.json(
              { ok: false, error: 'Confirmation token not found.' },
              { status: 404 },
            )
          }
          return Response.json({
            ok: true,
            reservation: {
              desiredName: reservation.desiredName,
              confirmedAt: reservation.confirmedAt,
            },
          })
        } catch (error) {
          if (error instanceof ReservationValidationError) {
            return Response.json(
              { ok: false, error: error.message },
              { status: error.status },
            )
          }
          return Response.json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 500 },
          )
        }
      },
    },
  },
})
