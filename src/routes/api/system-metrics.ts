import os from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/system-metrics')({
  server: {
    handlers: {
      GET: async () => {
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        return json({
          cpu: 0,
          ramUsed: totalMem - freeMem,
          ramTotal: totalMem,
          diskPercent: 0,
          uptime: os.uptime(),
          gatewayConnected: false,
        })
      },
    },
  },
})
