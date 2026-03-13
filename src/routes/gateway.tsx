import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/gateway')({
  component: function GatewayLayoutRoute() {
    return <Outlet />
  },
})
