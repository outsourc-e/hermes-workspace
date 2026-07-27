import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { NotionBrowserScreen } from '@/screens/notion/notion-browser-screen'

export const Route = createFileRoute('/notion')({
  ssr: false,
  component: NotionRoute,
})

function NotionRoute() {
  usePageTitle('Notion')
  return <NotionBrowserScreen />
}
