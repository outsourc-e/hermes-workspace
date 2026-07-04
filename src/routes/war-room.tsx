import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { WarRoomScreen } from '@/screens/war-room/war-room-screen'

export const Route = createFileRoute('/war-room')({
  ssr: false,
  component: WarRoomRoute,
})

function WarRoomRoute() {
  usePageTitle('Olympus War Room')
  return <WarRoomScreen />
}
