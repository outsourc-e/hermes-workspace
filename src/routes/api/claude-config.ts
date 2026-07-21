/**
 * Legacy config route shim.
 *
 * The frontend still calls /api/claude-config in a few places, but the real
 * implementation now lives in the shared Hermes config handlers.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  handleHermesConfigGet,
  handleHermesConfigPatch,
} from '../../server/hermes-config-route'

export const Route = createFileRoute('/api/claude-config')({
  server: {
    handlers: {
      GET: handleHermesConfigGet,
      PATCH: handleHermesConfigPatch,
      POST: handleHermesConfigPatch,
    },
  },
})
