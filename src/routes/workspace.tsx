import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '@/screens/workspace/workspace-layout'

export const Route = createFileRoute('/workspace')({
  component: WorkspaceLayout,
})
