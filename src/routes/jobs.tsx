import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { JobsScreen } from '@/screens/jobs/jobs-screen'

export const Route = createFileRoute('/jobs')({
  component: function JobsRoute() {
    usePageTitle('Jobs')
    return <JobsScreen />
  },
})
