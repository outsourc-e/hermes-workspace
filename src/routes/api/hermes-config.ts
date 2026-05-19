/**
 * Hermes Config API — proxy route for hermes-config-route handlers.
 * Maps GET and PATCH/POST to the server-side config read/write logic.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  handleHermesConfigGet,
  handleHermesConfigPatch,
} from '../../server/hermes-config-route'

export const Route = createFileRoute('/api/hermes-config')({
  server: {
    handlers: {
      GET: handleHermesConfigGet,
      PATCH: handleHermesConfigPatch,
      POST: handleHermesConfigPatch,
    },
  },
})
