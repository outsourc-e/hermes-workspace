import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { DesktopConductorScreen } from '@/screens/jarvis/conductor/desktop-conductor'

export const Route = createFileRoute('/jarvis-conductor')({
  ssr: false,
  component: JarvisConductorRoute,
})

function JarvisConductorRoute() {
  usePageTitle('JARVIS Conductor')

  // Dev-only surface: the board renders fixture data for design review and
  // must never be reachable in a production build.
  if (!import.meta.env.DEV) {
    return <div>Not available</div>
  }

  return <DesktopConductorScreen />
}
