import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

// Lazy-loaded: dashboard pulls recharts — keep out of main bundle
const DashboardScreen = lazy(() =>
  import('@/screens/dashboard/dashboard-screen').then((m) => ({
    default: m.DashboardScreen,
  })),
)

export const Route = createFileRoute('/dashboard')({
  ssr: false,
  component: DashboardRoute,
})

function DashboardRoute() {
  usePageTitle('Dashboard')
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-primary-500">
          Loading dashboard...
        </div>
      }
    >
      <DashboardScreen />
    </Suspense>
  )
}
