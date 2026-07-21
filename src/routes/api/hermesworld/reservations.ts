import { createFileRoute } from '@tanstack/react-router'
import {
  countReservations,
  createReservation,
  createSupabaseReservationStore,
  ReservationValidationError,
  sendReservationConfirmationEmail,
} from '@/server/name-reservations'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
  safeErrorMessage,
} from '@/server/rate-limit'

function requestBaseUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export const Route = createFileRoute('/api/hermesworld/reservations')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const store = createSupabaseReservationStore()
          const count = await countReservations(store)
          return Response.json({ ok: true, count })
        } catch (error) {
          return Response.json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        const contentTypeError = requireJsonContentType(request)
        if (contentTypeError) return contentTypeError

        const ip = getClientIp(request)
        if (!rateLimit(`reserve:${ip}`, 5, 10 * 60 * 1000)) {
          return rateLimitResponse()
        }

        try {
          const body = await request.json()
          const store = createSupabaseReservationStore()
          const reservation = await createReservation(body, {
            store,
            sendConfirmationEmail: sendReservationConfirmationEmail,
            baseUrl: requestBaseUrl(request),
          })
          return Response.json({
            ok: true,
            reservation: {
              desiredName: reservation.desiredName,
              email: reservation.email,
              wallet: reservation.wallet,
              confirmedAt: reservation.confirmedAt,
              createdAt: reservation.createdAt,
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
