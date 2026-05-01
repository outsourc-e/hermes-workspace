export const CHAT_OPEN_MESSAGE_SEARCH_EVENT = 'claude:chat-open-message-search'

export const CHAT_RUN_COMMAND_EVENT = 'claude:chat-run-command'

export const CHAT_PENDING_COMMAND_STORAGE_KEY = 'claude.pending-chat-command'

export type ChatRunCommandDetail = {
  command: string
}

export const CHAT_OPEN_SETTINGS_EVENT = 'claude:chat-open-settings'

export type ChatOpenSettingsDetail = {
  section: 'claude' | 'appearance'
}
