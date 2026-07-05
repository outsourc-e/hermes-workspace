import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

// Lazy-loaded: HermesWorld landing/embed is heavy — keep out of main bundle
const HermesWorldLanding = lazy(() =>
  import('@/screens/playground/hermes-world-landing').then((m) => ({
    default: m.HermesWorldLanding,
  })),
)

export const Route = createFileRoute('/hermes-world')({
  ssr: false,
  component: HermesWorldRoute,
})

function HermesWorldRoute() {
  usePageTitle('HermesWorld — AI Agent RPG')
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-primary-500">
          Loading HermesWorld...
        </div>
      }
    >
      <HermesWorldLanding />
    </Suspense>
  )
}
