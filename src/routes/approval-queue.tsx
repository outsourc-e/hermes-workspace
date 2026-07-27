import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ApprovalQueueScreen } from '@/screens/approval-queue/approval-queue-screen'

export const Route = createFileRoute('/approval-queue')({
  ssr: false,
  component: ApprovalQueueRoute,
})

function ApprovalQueueRoute() {
  usePageTitle('Approval Queue')
  return <ApprovalQueueScreen />
}
