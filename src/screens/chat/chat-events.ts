export const CHAT_OPEN_MESSAGE_SEARCH_EVENT =
  'hermes:chat-open-message-search'

export const CHAT_RUN_COMMAND_EVENT = 'hermes:chat-run-command'

export const CHAT_PENDING_COMMAND_STORAGE_KEY =
  'hermes.pending-chat-command'

export type ChatRunCommandDetail = {
  command: string
}
