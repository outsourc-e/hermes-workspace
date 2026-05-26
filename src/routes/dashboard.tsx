import { createFileRoute } from '@tanstack/react-router'
import { HUDShell } from '../components/hud/HUDShell'

export const Route = createFileRoute('/dashboard')({
  ssr: false,
  component: DashboardPage,
})

function DashboardPage() {
  return <HUDShell />
}
