import { useMemo } from 'react'
import {
  WifiConnected01Icon,
  WifiDisconnected01Icon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  useGatewayChatStore,
  type ConnectionState,
} from '../../../stores/gateway-chat-store'
import { getConnectionErrorInfo } from '@/lib/connection-errors'
import { cn } from '@/lib/utils'

type RealtimeStatusProps = {
  className?: string
  showLabel?: boolean
}

const STATUS_CONFIG: Record<
  ConnectionState,
  {
    icon: typeof WifiConnected01Icon
    label: string
    color: string
    animate?: boolean
  }
> = {
  connected: {
    icon: WifiConnected01Icon,
    label: 'Connected',
    color: 'text-green-500',
  },
  connecting: {
    icon: Loading03Icon,
    label: 'Reconnecting…',
    color: 'text-yellow-500',
    animate: true,
  },
  disconnected: {
    icon: WifiDisconnected01Icon,
    label: 'Updates paused',
    color: 'text-neutral-400',
  },
  error: {
    icon: WifiDisconnected01Icon,
    label: 'Connection issue',
    color: 'text-red-500',
  },
}

export function RealtimeStatus({
  className,
  showLabel = false,
}: RealtimeStatusProps) {
  const connectionState = useGatewayChatStore((s) => s.connectionState)
  const lastError = useGatewayChatStore((s) => s.lastError)
  const errorInfo = useMemo(() => getConnectionErrorInfo(lastError), [lastError])

  const config = useMemo(() => {
    return STATUS_CONFIG[connectionState]
  }, [connectionState])

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs',
        config.color,
        className,
      )}
      title={
        connectionState === 'error'
          ? `Realtime: ${errorInfo.title}. ${errorInfo.description}`
          : `Realtime: ${config.label}`
      }
    >
      <HugeiconsIcon
        icon={config.icon}
        size={14}
        strokeWidth={2}
        className={cn(config.animate && 'animate-spin')}
      />
      {showLabel && <span className="font-medium">{config.label}</span>}
    </div>
  )
}
