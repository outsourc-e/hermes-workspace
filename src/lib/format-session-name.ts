/**
 * Convert raw Claude session keys to human-readable names.
 *
 * Examples:
 *   "agent:main:main" → "Main"
 *   "agent:main:cron:da44e65e..." → "Cron Task"
 *   "agent:main:direct:telegram:12345" → "Telegram"
 *   "agent:main:subagent:abc123" → "Sub-agent"
 */

const PLATFORM_NAMES: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  imessage: 'iMessage',
  webchat: 'Claude',
  'hermes-workspace': 'Hermes',
  slack: 'Slack',
  irc: 'IRC',
  googlechat: 'Google Chat',
}

export function formatSessionKey(key: string): string {
  if (!key) return 'Unknown'

  const parts = key.split(':')

  // agent:main:main → Main
  if (key === 'agent:main:main') return 'Main'

  // agent:main:cron:UUID → Cron Task
  if (parts.length >= 3 && parts[2] === 'cron') return 'Cron Task'

  // agent:main:subagent:UUID → Sub-agent
  if (parts.length >= 3 && parts[2] === 'subagent') return 'Sub-agent'

  // agent:main:direct:PLATFORM:ID → Platform name
  if (parts.length >= 4 && parts[2] === 'direct') {
    const platform = parts[3]
    return PLATFORM_NAMES[platform] || titleCase(platform)
  }

  // agent:AGENT_NAME:acp:UUID → ACP: agent name
  if (parts.length >= 3 && parts[2] === 'acp') {
    const agentName = parts[1] || 'agent'
    return `${titleCase(agentName)} (ACP)`
  }

  // agent:AGENT_NAME:... → agent name
  if (parts[0] === 'agent' && parts.length >= 2) {
    const name = parts[1]
    if (name === 'main' && parts.length > 2) {
      return titleCase(parts[2])
    }
    return titleCase(name)
  }

  // Fallback: last meaningful segment
  const lastMeaningful = parts
    .filter((p) => (p.length > 8 ? false : true))
    .pop()
  return lastMeaningful ? titleCase(lastMeaningful) : key
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}
