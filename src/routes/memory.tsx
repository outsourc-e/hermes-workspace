import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { MemoryBrowserScreen } from '@/screens/memory/memory-browser-screen'

export const Route = createFileRoute('/memory')({
  ssr: false,
  component: function MemoryRoute() {
    usePageTitle('Memory')
    if (!useFeatureAvailable('memory')) {
      return (
        <BackendUnavailableState
          feature="Memory"
          description={getUnavailableReason('Memory')}
        />
      )
    }
    return <MemoryBrowserScreen />
  },
})
