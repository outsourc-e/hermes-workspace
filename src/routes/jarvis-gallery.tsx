import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { JarvisGalleryScreen } from '@/screens/jarvis/gallery/jarvis-gallery'

export const Route = createFileRoute('/jarvis-gallery')({
  ssr: false,
  component: JarvisGalleryRoute,
})

function JarvisGalleryRoute() {
  usePageTitle('JARVIS Gallery')

  // Dev-only surface: the gallery renders fixture data for design review and
  // must never be reachable in a production build.
  if (!import.meta.env.DEV) {
    return <div>Not available</div>
  }

  return <JarvisGalleryScreen />
}
