import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/send-stream')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/api/send-stream"!</div>
}
