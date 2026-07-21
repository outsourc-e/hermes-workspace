import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ProductIntelligenceScreen } from '@/screens/product-intelligence/product-intelligence-screen'

export const Route = createFileRoute('/product-intelligence')({
  ssr: false,
  component: ProductIntelligenceRoute,
})

function ProductIntelligenceRoute() {
  usePageTitle('Product Intelligence DB')
  return <ProductIntelligenceScreen />
}
