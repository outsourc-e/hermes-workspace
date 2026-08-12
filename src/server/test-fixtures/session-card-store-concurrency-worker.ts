import { existsSync, writeFileSync } from 'node:fs'

import {
  reserveSessionCardBranchReplay,
  updateSessionCardMetadata,
} from '../session-card-store'

type ReservationRequest = {
  cardId: string
  requestKeyHash: string
  fingerprint: string
}

type PausedUpdateRequest = {
  action: 'paused-update'
  cardId: string
  title: string
  pauseMarker: string
  resumeMarker: string
}

if (!process.send) {
  throw new Error('Session Card concurrency worker requires an IPC channel')
}

process.on('message', (message: ReservationRequest | PausedUpdateRequest) => {
  if ('action' in message) {
    const originalStringify = JSON.stringify
    let paused = false
    JSON.stringify = ((value: unknown, ...args: Array<unknown>) => {
      if (
        !paused &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value as { version?: unknown }).version === 1 &&
        'cards' in value
      ) {
        paused = true
        writeFileSync(message.pauseMarker, 'ready\n', 'utf8')
        const signal = new Int32Array(new SharedArrayBuffer(4))
        while (!existsSync(message.resumeMarker)) {
          Atomics.wait(signal, 0, 0, 5)
        }
      }
      return Reflect.apply(originalStringify, JSON, [value, ...args]) as string
    }) as typeof JSON.stringify
    try {
      const metadata = updateSessionCardMetadata(message.cardId, {
        autoTitle: message.title,
      })
      process.send?.({ ok: true, metadata })
    } catch (error) {
      process.send?.({
        ok: false,
        error: error instanceof Error ? error.message : 'unknown failure',
      })
    } finally {
      JSON.stringify = originalStringify
    }
    return
  }

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
