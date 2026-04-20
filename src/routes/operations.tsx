import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgentsScreen } from '@/screens/gateway/agents-screen'

export const Route = createFileRoute('/operations')({
  ssr: false,
  component: function OperationsRoute() {
    usePageTitle('Operations')
    return <AgentsScreen variant="registry" />
  },
  errorComponent: function OperationsError({ error }) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-primary-950 p-6 text-center">
        <h2 className="mb-3 text-xl font-semibold text-primary-100">
          Failed to Load Operations
        </h2>
        <p className="mb-4 max-w-md text-sm text-primary-400">
          {error instanceof Error
            ? error.message
            : 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent-500 px-4 py-2 text-primary-950 transition-colors hover:bg-accent-400"
        >
          Reload Page
        </button>
      </div>
    )
  },
  pendingComponent: function OperationsPending() {
    return (
      <div className="flex h-full items-center justify-center bg-primary-950">
        <div className="text-center">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          <p className="text-sm text-primary-400">Loading operations...</p>
        </div>
      </div>
    )
  },
})
