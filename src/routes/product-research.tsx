import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ProductResearchScreen } from '@/screens/product-research/product-research-screen'

export const Route = createFileRoute('/product-research')({
  ssr: false,
  component: ProductResearchRoute,
})

function ProductResearchRoute() {
  usePageTitle('Product Research')
  return <ProductResearchScreen />
}
