import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

// Lazy-loaded to keep the replay screen out of the main bundle
const ReplayScreen = lazy(() =>
  import('@/screens/swarm2/replay-screen').then((m) => ({
    default: m.ReplayScreen,
  })),
)

export const Route = createFileRoute('/replay')({
  ssr: false,
  component: function ReplayRoute() {
    usePageTitle('Replay')
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          </div>
        }
      >
        <ReplayScreen />
      </Suspense>
    )
  },
})
