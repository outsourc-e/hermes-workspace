import { reserveSessionCardBranchReplay } from '../session-card-store'

type ReservationRequest = {
  cardId: string
  requestKeyHash: string
  fingerprint: string
}

if (!process.send) {
  throw new Error('Session Card concurrency worker requires an IPC channel')
}

process.on('message', (message: ReservationRequest) => {
  try {
    const reservation = reserveSessionCardBranchReplay(
      message.cardId,
      message.requestKeyHash,
      message.fingerprint,
    )
    process.send?.({ ok: true, reservation })
  } catch {
    process.send?.({ ok: false })
  }
})

process.send({ ready: true })
