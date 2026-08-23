import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { DesktopCommandScreen } from '@/screens/jarvis/command/desktop-command'

export const Route = createFileRoute('/jarvis-command')({
  ssr: false,
  component: JarvisCommandRoute,
})

function JarvisCommandRoute() {
  usePageTitle('JARVIS Command')

  // Dev-only surface: the board renders fixture data for design review and
  // must never be reachable in a production build.
  if (!import.meta.env.DEV) {
    return <div>Not available</div>
  }

  return <DesktopCommandScreen />
}
