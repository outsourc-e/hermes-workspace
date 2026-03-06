import { useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { GatewaySetupWizard } from '@/components/gateway-setup-wizard'
import { useGatewaySetupStore } from '@/hooks/use-gateway-setup'

export const Route = createFileRoute('/wizard')({
  component: WizardPage,
})

function WizardPage() {
  const open = useGatewaySetupStore((s) => s.open)

  // Auto-open the wizard when visiting /wizard directly
  useEffect(() => {
    open()
  }, [open])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <GatewaySetupWizard />
        <div className="mt-4 text-center">
          <Link
            to="/dashboard"
            className="text-sm text-primary-500 hover:text-primary-700 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
