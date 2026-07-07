import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { DstnyDocumentsScreen } from '@/screens/dstny-documents/dstny-documents-screen'

export const Route = createFileRoute('/dstny-documents')({
  ssr: false,
  component: DstnyDocumentsRoute,
})

function DstnyDocumentsRoute() {
  usePageTitle('Documents Dstny')
  return <DstnyDocumentsScreen />
}
