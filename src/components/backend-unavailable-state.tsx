import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type Props = {
  feature: string
  description?: string
}

export function BackendUnavailableState({ feature, description }: Props) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-amber-500/25 bg-[#080d12]/90 p-8 text-center shadow-sm backdrop-blur-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-200 shadow-sm">
          <HugeiconsIcon icon={Alert02Icon} size={24} strokeWidth={1.7} />
        </div>
        <div className="mt-4 space-y-2">
          <h2 className="font-mono text-lg font-semibold text-amber-50">{feature}</h2>
          <p className="text-sm leading-6 text-amber-100/70">
            Not available on this backend. Connect to the local Nova gateway to unlock{' '}
            {feature}.
          </p>
          {description ? (
            <p className="text-xs leading-5 text-amber-200/60">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default BackendUnavailableState
