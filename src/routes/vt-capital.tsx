import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

// Lazy-loaded to keep the VT Capital screen out of the main bundle
const VtCapitalScreen = lazy(() =>
  import('@/screens/vt-capital/vt-capital-screen').then((m) => ({
    default: m.VtCapitalScreen,
  })),
)

export const Route = createFileRoute('/vt-capital')({
  ssr: false,
  component: function VtCapitalRoute() {
    usePageTitle('VT Capital')
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-primary-500">
            Loading VT Capital...
          </div>
        }
      >
        <VtCapitalScreen />
      </Suspense>
    )
  },
})
