import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  ssr: false,
  component: function SettingsLayoutRoute() {
    return <Outlet />
  },
})
