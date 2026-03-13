import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayLogsScreen } from '@/screens/gateway/logs-screen'

export const Route = createFileRoute('/gateway/logs')({
  component: function GatewayLogsRoute() {
    usePageTitle('Gateway Logs')
    return <GatewayLogsScreen />
  },
  errorComponent: function GatewayLogsError({ error }) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-primary-50 p-6 text-center">
        <h2 className="mb-3 text-xl font-semibold text-primary-900">
          Failed to Load Gateway Logs
        </h2>
        <p className="mb-4 max-w-md text-sm text-primary-600">
          {error instanceof Error
            ? error.message
            : 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent-500 px-4 py-2 text-white transition-colors hover:bg-accent-600"
        >
          Reload Page
        </button>
      </div>
    )
  },
  pendingComponent: function GatewayLogsPending() {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          <p className="text-sm text-primary-500">Loading gateway logs...</p>
        </div>
      </div>
    )
  },
})
