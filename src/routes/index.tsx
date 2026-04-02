import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: function redirectToChat() {
    throw redirect({
      to: '/chat' as string,
      replace: true,
    })
  },
  component: function IndexRoute() {
    return null
  },
})
