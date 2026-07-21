import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { VtCapitalScreen } from '@/screens/vt-capital/vt-capital-screen'

export const Route = createFileRoute('/vt-capital')({
  ssr: false,
  component: function VtCapitalRoute() {
    usePageTitle('VT Capital')
    return <VtCapitalScreen />
  },
})
