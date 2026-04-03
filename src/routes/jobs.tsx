import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { JobsScreen } from '@/screens/jobs/jobs-screen'

export const Route = createFileRoute('/jobs')({
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
    return <JobsScreen />
  },
})
