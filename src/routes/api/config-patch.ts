/**
 * Config Patch API — handles provider/settings saves from the providers screen
 * and provider wizard. Delegates to the same hermes-config-route handler.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  handleHermesConfigPatch,
} from '../../server/hermes-config-route'

export const Route = createFileRoute('/api/config-patch')({
  server: {
    handlers: {
      POST: handleHermesConfigPatch,
    },
  },
})
