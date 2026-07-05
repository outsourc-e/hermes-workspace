import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

// Lazy-loaded to keep the Agora screen out of the main bundle
const AgoraScreen = lazy(() =>
  import('@/screens/agora/agora-screen').then((m) => ({
    default: m.AgoraScreen,
  })),
)

export const Route = createFileRoute('/agora')({
  ssr: false,
  component: AgoraRoute,
})

function AgoraRoute() {
  usePageTitle('Agora')
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-primary-500">
          Loading Agora...
        </div>
      }
    >
      <AgoraScreen />
    </Suspense>
  )
}
