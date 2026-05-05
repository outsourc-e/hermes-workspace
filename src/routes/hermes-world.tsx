import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { HermesWorldLanding } from '@/screens/playground/hermes-world-landing'

export const Route = createFileRoute('/hermes-world')({
  ssr: false,
  component: HermesWorldRoute,
})

function HermesWorldRoute() {
  usePageTitle('HermesWorld — AI Agent RPG')
  return <HermesWorldLanding />
}
