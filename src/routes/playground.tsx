import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

// Lazy-loaded: playground screens pull heavy deps (three.js) — keep out of main bundle
const HermesWorldEmbed = lazy(() =>
  import('@/screens/playground/hermes-world-embed').then((m) => ({
    default: m.HermesWorldEmbed,
  })),
)

export const Route = createFileRoute('/playground')({
  ssr: false,
  component: PlaygroundRoute,
})

function PlaygroundRoute() {
  usePageTitle('HermesWorld')
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-primary-500">
          Loading HermesWorld...
        </div>
      }
    >
      <HermesWorldEmbed />
    </Suspense>
  )
}
