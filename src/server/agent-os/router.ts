import { createAgentOsTask, listAgentOsTasks, routeTask, updateTaskStatus } from './store'
import { notifyAgentOsFailure } from './notifications'

export function determineRouteForWorkflow(workflowKey: string): 'n8n' | 'hermes' | 'openclaw' | 'manual' {
  switch (workflowKey) {
    case 'morning-briefing':
    case 'calendar-scan-meeting-prep':
    case 'inbox-triage':
    case 'shopify-monitoring':
      return 'n8n'
    case 'job-pipeline':
    case 'rootly-prospect-research':
      return 'hermes'
    case 'airbnb-host-automation':
      return 'openclaw'
    default:
      return 'manual'
  }
}

export function enqueueWorkflowTask(input: {
  title: string
  workflow_key: string
  description?: string
  payload?: Record<string, unknown>
  project?: string | null
  priority?: 'critical' | 'high' | 'medium' | 'low'
  created_by?: string
}) {
  const task = createAgentOsTask(input)
  if (task.status === 'awaiting_approval') return task
  const route = determineRouteForWorkflow(task.workflow_key)
  routeTask(task.id, route, { auto: true, reason: 'workflow default router' })
  return task
}

export function claimQueuedTask(taskId: string) {
  const task = listAgentOsTasks().find((row) => row.id === taskId)
  if (!task) return null
  if (!['queued', 'routed', 'retrying'].includes(task.status)) return task
  return updateTaskStatus(task.id, 'running', 'Task execution started.', { route: task.route })
}

export async function failTask(taskId: string, error: string, willRetry = false) {
  const task = listAgentOsTasks().find((row) => row.id === taskId)
  const updated = updateTaskStatus(
    taskId,
    willRetry ? 'retrying' : 'failed',
    willRetry ? 'Task failed and scheduled for retry.' : 'Task failed.',
    { error },
  )
  if (updated && !willRetry && task) {
    await notifyAgentOsFailure({
      taskId: task.id,
      title: task.title,
      workflowKey: task.workflow_key,
      error,
      route: task.route,
    })
  }
  return updated
}

export function completeTask(taskId: string, message = 'Task completed successfully.') {
  return updateTaskStatus(taskId, 'completed', message)
}

export function pendingDispatchQueue() {
  return listAgentOsTasks().filter((task) => ['queued', 'routed', 'retrying'].includes(task.status))
}
