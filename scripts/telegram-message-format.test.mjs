import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { buildTelegramMessagePreview, formatHumanTelegramMessage } from './telegram-message-format.mjs'

const execFileAsync = promisify(execFile)
const previewTypes = ['discovery', 'approval', 'code-edit-approval', 'completion']
const allTypes = [
  'discovery',
  'approval',
  'implementation-proposal-approval',
  'code-edit-approval',
  'approval-recorded',
  'completion',
  'blocked-error',
]

function expectSixPartMessage(message) {
  expect(message).toMatchSnapshot()
  expect(message).toContain('What happened:')
  expect(message).toContain('Recommendation:')
  expect(message).toContain('If you approve:')
  expect(message).toContain('What will NOT happen:')
  expect(message).toContain('Reply:')
  expect(message.length).toBeLessThanOrEqual(900)
}

describe('human-readable Telegram message formatting', () => {
  it.each(allTypes)('formats %s as a short six-part phone message', async (type) => {
    const result = await buildTelegramMessagePreview({ type })
    expect(result.ok).toBe(true)
    expectSixPartMessage(result.message)
    expect(result.message).not.toContain('idea_body')
    expect(result.message).not.toContain('SHOULD_NOT_BE_SENT')
    expect(result.message).not.toMatch(/bot\d+:/)
    expect(result.message).not.toMatch(/chat[_-]?id\s*[:=]/i)
    expect(result.secrets_included).toBe(false)
    expect(result.raw_idea_body_included).toBe(false)
    expect(result.githubCalls).toBe(false)
    expect(result.githubWrites).toBe(false)
    expect(result.codeEdits).toBe(false)
    expect(result.auditAppend).toBe(false)
    expect(result.durableMutation).toBe(false)
    expect(result.obsidianKanbanWrites).toBe(false)
  })

  it.each(previewTypes)('telegram-message-preview --type %s --json works without side effects', async (type) => {
    const { stdout } = await execFileAsync('node', ['bin/telegram-message-preview', '--type', type, '--json'], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
    })
    const result = JSON.parse(stdout)
    expect(result.ok).toBe(true)
    expect(result.type).toBe(type)
    expect(result.sent).toBe(false)
    expect(result.sendTest).toBe(false)
    expect(result.githubCalls).toBe(false)
    expect(result.githubWrites).toBe(false)
    expect(result.auditAppend).toBe(false)
    expectSixPartMessage(result.message)
  })

  it('includes approve/reject aliases and hides long IDs by default', async () => {
    const result = await buildTelegramMessagePreview({ type: 'code-edit-approval' })
    expect(result.message).toContain('/approve edit1')
    expect(result.message).toContain('/reject edit1')
    expect(result.message).not.toContain('code_edit_build_impl_tg4_1234567890abcdef_longlonglong')
    expect(result.full_ids_hidden).toBe(true)
  })

  it('shows full IDs only in verbose mode', async () => {
    const quiet = await buildTelegramMessagePreview({ type: 'approval' })
    const verbose = await buildTelegramMessagePreview({ type: 'approval', verbose: true })
    expect(quiet.message).not.toContain('tg4_1234567890abcdef')
    expect(verbose.message).toContain('tg4_1234567890abcdef')
  })

  it('redacts secrets, chat IDs, raw idea_body, and long paths from message text', () => {
    const message = formatHumanTelegramMessage({
      type: 'blocked-error',
      reason: 'token=SHOULD_NOT_SURVIVE chat_id=123456789 idea_body: RAW_BODY /root/some/really/long/path/that/should/not/be/printed/in/a/tiny/telegram/message/file.txt',
      alias: 'blk1',
    })
    expect(message).not.toContain('SHOULD_NOT_SURVIVE')
    expect(message).not.toContain('123456789')
    expect(message).not.toContain('RAW_BODY')
    expect(message).toContain('[long path hidden]')
  })
})
