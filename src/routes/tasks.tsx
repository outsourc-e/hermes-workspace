import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { usePageTitle } from '@/hooks/use-page-title'
import { TasksScreen } from '@/screens/tasks/tasks-screen'

const searchSchema = z.object({
  assignee: z.string().optional(),
})

export const Route = createFileRoute('/tasks')({
  ssr: false,
  validateSearch: searchSchema,
  component: TasksRoute,
})

function TasksRoute() {
  usePageTitle('Tasks')
  return <TasksScreen />
}
