import { describe, expect, it } from 'vitest'
import {
  createOrUpdateToolArtifact,
  externalizeLargeToolOutput,
  getToolArtifact,
} from './tool-artifacts-store'

describe('tool artifact store', () => {
  it('stores large tool output and replaces the chat payload with a compact pointer', () => {
    const largeOutput = `header\n${'x'.repeat(4_200)}\ntail`
    const compact = externalizeLargeToolOutput('test-session-artifacts', {
      id: 'msg-large-tool-output',
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'read_file',
      content: [{ type: 'text', text: largeOutput }],
      text: largeOutput,
    })

    expect(compact.artifactId).toMatch(/^toolout_/)
    expect(String(compact.text)).toContain('Full output stored as artifact')
    expect(String(compact.text).length).toBeLessThan(largeOutput.length)
    expect(JSON.stringify(compact)).not.toContain('x'.repeat(1_200))

    const artifact = getToolArtifact(String(compact.artifactId))
    expect(artifact?.content).toBe(largeOutput)
    expect(artifact?.toolName).toBe('read_file')
    expect(artifact?.kind).toBe('file_read')
  })

  it('uses stable ids for the same tool output', () => {
    const first = createOrUpdateToolArtifact({
      sessionId: 'test-session-artifacts',
      messageId: 'msg-stable',
      toolName: 'terminal',
      content: 'same terminal log',
    })
    const second = createOrUpdateToolArtifact({
      sessionId: 'test-session-artifacts',
      messageId: 'msg-stable',
      toolName: 'terminal',
      content: 'same terminal log',
    })

    expect(second.id).toBe(first.id)
    expect(second.kind).toBe('terminal_log')
  })
})
