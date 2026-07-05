import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'

// Lazy-loaded to keep the Jobs screen out of the main bundle
const JobsScreen = lazy(() =>
  import('@/screens/jobs/jobs-screen').then((m) => ({
    default: m.JobsScreen,
  })),
)

export const Route = createFileRoute('/jobs')({
  ssr: false,
  component: function JobsRoute() {
    usePageTitle('Jobs')
    if (!useFeatureAvailable('jobs')) {
      return (
        <BackendUnavailableState
          feature="Jobs"
          description={getUnavailableReason('Jobs')}
        />
      )
    }
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-primary-500">
            Loading jobs...
          </div>
        }
      >
        <JobsScreen />
      </Suspense>
    )
  },
})
