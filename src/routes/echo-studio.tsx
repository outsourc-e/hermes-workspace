import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

// Lazy-loaded to keep the Echo Studio screen out of the main bundle
const EchoStudioScreen = lazy(() =>
  import('@/screens/echo-studio/echo-studio-screen').then((m) => ({
    default: m.EchoStudioScreen,
  })),
)

export const Route = createFileRoute('/echo-studio')({
  ssr: false,
  component: function EchoStudioRoute() {
    usePageTitle('Echo Studio')
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-primary-500">
            Loading Echo Studio...
          </div>
        }
      >
        <EchoStudioScreen />
      </Suspense>
    )
  },
  errorComponent: function EchoStudioError({ error }) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-primary-50 p-6 text-center">
        <h2 className="mb-3 text-xl font-semibold text-primary-900">
          Failed to Load Echo Studio
        </h2>
        <p className="mb-4 max-w-md text-sm text-primary-600">
          {error instanceof Error
            ? error.message
            : 'An unexpected error occurred'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent-500 px-4 py-2 text-white transition-colors hover:bg-accent-600"
        >
          Reload Page
        </button>
      </div>
    )
  },
})
