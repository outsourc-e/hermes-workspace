import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { PlaygroundScreen } from '@/screens/playground/playground-screen'

export const Route = createFileRoute('/playground')({
  ssr: false,
  component: PlaygroundRoute,
})

function PlaygroundRoute() {
  usePageTitle('HermesWorld')
  return <PlaygroundScreen />
}
