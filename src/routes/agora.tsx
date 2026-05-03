import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgoraScreen } from '@/screens/agora/agora-screen'

export const Route = createFileRoute('/agora')({
  ssr: false,
  component: AgoraRoute,
})

function AgoraRoute() {
  usePageTitle('Agora')
  return <AgoraScreen />
}
