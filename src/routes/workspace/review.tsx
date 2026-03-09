import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ReviewQueueScreen } from '@/screens/review/review-queue-screen'

export const Route = createFileRoute('/workspace/review')({
  component: function WorkspaceReviewRoute() {
    usePageTitle('Workspace Review Queue')
    return <ReviewQueueScreen />
  },
})
