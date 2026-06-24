/**
 * GET/PATCH /api/hermes-config
 *
 * Canonical Hermes config API — reads/writes ~/.hermes/config.yaml and
 * ~/.hermes/.env. The real handler logic lives in
 * src/server/hermes-config-route.ts; this file is the thin route wiring.
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
    },
  },
})
