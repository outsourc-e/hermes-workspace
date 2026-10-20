import { describe, expect, it } from 'vitest'
import {
  normalizeExternalConversation,
  normalizeExternalConversationMessage,
} from './aioncore-conversations'

describe('AionCore conversation normalization', () => {
  it('maps conversation identity, runtime binding, and activity', () => {
    expect(
      normalizeExternalConversation({
        id: 'conv-1',
        name: 'Review the patch',
        type: 'acp',
        status: 'pending',
        created_at: 100,
        modified_at: 200,
        extra: {
          agent_id: 'codex-id',
          backend: 'codex',
          workspace: '/workspace',
          ignored_secret: 'not projected',
        },
        runtime: {
          state: 'running',
          is_processing: true,
          can_send_message: false,
          pending_confirmations: 1,
          turn_id: 'turn-1',
        },
      }),
    ).toMatchObject({
      id: 'conv-1',
      runtimeId: 'codex-id',
      backend: 'codex',
      status: 'pending',
      modifiedAt: 200,
      runtime: {
        state: 'running',
        isProcessing: true,
        pendingConfirmations: 1,
      },
    })
  })

  it('rejects conversation rows without ids', () => {
    expect(normalizeExternalConversation({ name: 'Missing id' })).toBeNull()
  })

  it('maps message direction and preserves structured content', () => {
    expect(
      normalizeExternalConversationMessage({
        id: 'message-1',
        conversation_id: 'conv-1',
        type: 'tool_call',
        position: 'left',
        content: { name: 'read_file', status: 'running' },
        created_at: 300,
      }),
    ).toMatchObject({
      id: 'message-1',
      conversationId: 'conv-1',
      type: 'tool_call',
      position: 'left',
      content: { name: 'read_file', status: 'running' },
      createdAt: 300,
    })
  })
})
