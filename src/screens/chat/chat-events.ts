export const CHAT_OPEN_MESSAGE_SEARCH_EVENT =
  'clawsuite:chat-open-message-search'

export const CHAT_RUN_COMMAND_EVENT = 'clawsuite:chat-run-command'

export const CHAT_PENDING_COMMAND_STORAGE_KEY =
  'clawsuite.pending-chat-command'

export type ChatRunCommandDetail = {
  command: string
}
