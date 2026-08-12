import { memo } from 'react'
import type { CSSProperties, ComponentPropsWithoutRef } from 'react'
import {
  selectAgentAvatarDataUrl,
  selectAgentDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'

export const DEFAULT_AGENT_AVATAR_SRC = '/claude-avatar.webp'

type AgentIdentityAvatarProps = Omit<
  ComponentPropsWithoutRef<'img'>,
  'alt' | 'height' | 'src' | 'width'
> & {
  alt?: string
  size?: number
}

function AgentIdentityAvatarComponent({
  alt,
  size,
  style,
  ...props
}: AgentIdentityAvatarProps) {
  const avatarDataUrl = useChatSettingsStore(selectAgentAvatarDataUrl)
  const agentName = useChatSettingsStore(selectAgentDisplayName)
  const avatarStyle: CSSProperties = {
    ...(size === undefined ? {} : { height: size, width: size }),
    ...style,
  }

  return (
    <img
      {...props}
      src={avatarDataUrl ?? DEFAULT_AGENT_AVATAR_SRC}
      alt={alt ?? agentName}
      style={avatarStyle}
    />
  )
}

export const AgentIdentityAvatar = memo(AgentIdentityAvatarComponent)
