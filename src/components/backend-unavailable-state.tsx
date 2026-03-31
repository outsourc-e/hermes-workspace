import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type Props = {
  feature: string
  description?: string
}

export function BackendUnavailableState({
  feature,
  description,
}: Props) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-primary-200 bg-primary-50/70 p-8 text-center shadow-sm backdrop-blur-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary-200 bg-white text-primary-600 shadow-sm">
          <HugeiconsIcon icon={Alert02Icon} size={24} strokeWidth={1.7} />
        </div>
        <div className="mt-4 space-y-2">
          <h2 className="text-lg font-semibold text-primary-900">{feature}</h2>
          <p className="text-sm leading-6 text-primary-600">
            Not available on this backend. Connect to a Hermes gateway to
            unlock {feature}.
          </p>
          {description ? (
            <p className="text-xs leading-5 text-primary-500">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default BackendUnavailableState
