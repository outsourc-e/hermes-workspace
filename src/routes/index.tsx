import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: function redirectToMissionControl() {
    throw redirect({
      to: '/mission-control' as string,
      replace: true,
    })
  },
  component: function IndexRoute() {
    return null
  },
})
