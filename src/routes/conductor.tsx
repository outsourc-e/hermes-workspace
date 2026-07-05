import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'

// Lazy-loaded to keep the Conductor screen out of the main bundle
const Conductor = lazy(() =>
  import('@/screens/gateway/conductor').then((m) => ({
    default: m.Conductor,
  })),
)

function ConductorRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-primary-500">
          Loading conductor...
        </div>
      }
    >
      <Conductor />
    </Suspense>
  )
}

export const Route = createFileRoute('/conductor')({
  component: ConductorRoute,
})
