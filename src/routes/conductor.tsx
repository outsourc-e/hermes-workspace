import { createFileRoute } from '@tanstack/react-router'
import { Conductor } from '@/screens/gateway/conductor'

export const Route = createFileRoute('/conductor')({
  component: Conductor,
})
