/**
 * Legacy alias route for /api/claude-config.
 *
 * Delegates to the canonical Hermes config handlers in
 * src/server/hermes-config-route.ts, which already alias
 * provider.maskedCredentials -> provider.maskedKeys for legacy consumers.
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
    },
  },
})
