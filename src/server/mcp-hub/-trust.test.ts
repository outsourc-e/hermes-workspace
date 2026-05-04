import { describe, expect, it } from 'vitest'
import { normalizeTemplate } from './trust'

describe('normalizeTemplate — stdio', () => {
  const base = {
    name: 'test-server',
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@scope/pkg'],
    env: { MY_TOKEN: 'secret', SCREAMING: 'yes' },
  }

  it('accepts a valid stdio template', () => {
    const result = normalizeTemplate(base, 'official')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.name).toBe('test-server')
    expect(result.template.transportType).toBe('stdio')
    expect(result.template.command).toBe('npx')
    expect(result.template.args).toEqual(['-y', '@scope/pkg'])
  })

  it('rejects command containing ; (semicolon)', () => {
    const result = normalizeTemplate({ ...base, command: 'npx; rm -rf /' }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/metachar/)
  })

  it('rejects command containing | (pipe)', () => {
    const result = normalizeTemplate({ ...base, command: 'cat | sh' }, 'community')
    expect(result.ok).toBe(false)
  })

  it('rejects command containing & (ampersand)', () => {
    const result = normalizeTemplate({ ...base, command: 'cmd & evil' }, 'community')
    expect(result.ok).toBe(false)
  })

  it('rejects command containing $ (dollar)', () => {
    const result = normalizeTemplate({ ...base, command: 'npx $SHELL' }, 'community')
    expect(result.ok).toBe(false)
  })

  it('rejects command containing backtick', () => {
    const result = normalizeTemplate({ ...base, command: 'npx `id`' }, 'community')
    expect(result.ok).toBe(false)
  })

  it('rejects command containing < or >', () => {
    const r1 = normalizeTemplate({ ...base, command: 'cmd < /etc/passwd' }, 'community')
    const r2 = normalizeTemplate({ ...base, command: 'cmd > /tmp/out' }, 'community')
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
  })

  it('rejects arg equal to -c', () => {
    const result = normalizeTemplate({ ...base, args: ['-c', 'evil'] }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/-c/)
  })

  it('rejects arg starting with -c=', () => {
    const result = normalizeTemplate({ ...base, args: ['-c=evil'] }, 'community')
    expect(result.ok).toBe(false)
  })

  it('strips env keys not matching ^[A-Z][A-Z0-9_]*$', () => {
    const result = normalizeTemplate(
      {
        ...base,
        env: {
          GOOD_KEY: 'ok',
          bad_key: 'stripped',
          '1INVALID': 'stripped',
          ALSO_GOOD: 'yes',
        },
      },
      'official',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.env).toEqual({ GOOD_KEY: 'ok', ALSO_GOOD: 'yes' })
    expect(result.template.env).not.toHaveProperty('bad_key')
    expect(result.template.env).not.toHaveProperty('1INVALID')
  })

  it('rejects empty command', () => {
    const result = normalizeTemplate({ ...base, command: '' }, 'official')
    expect(result.ok).toBe(false)
  })

  it('rejects missing name', () => {
    const result = normalizeTemplate({ ...base, name: '' }, 'official')
    expect(result.ok).toBe(false)
  })

  it('rejects unsupported transport', () => {
    const result = normalizeTemplate({ ...base, transportType: 'ws' }, 'official')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/unsupported transport/)
  })
})

describe('normalizeTemplate — http', () => {
  const base = {
    name: 'http-server',
    transportType: 'http',
    url: 'https://example.com/mcp',
  }

  it('accepts a valid http template', () => {
    const result = normalizeTemplate(base, 'official')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.transportType).toBe('http')
    expect(result.template.url).toBe('https://example.com/mcp')
  })

  it('rejects non-http(s) url', () => {
    const result = normalizeTemplate({ ...base, url: 'ftp://example.com' }, 'official')
    expect(result.ok).toBe(false)
  })

  it('rejects invalid url', () => {
    const result = normalizeTemplate({ ...base, url: 'not-a-url' }, 'official')
    expect(result.ok).toBe(false)
  })

  it('rejects missing url', () => {
    const result = normalizeTemplate({ ...base, url: '' }, 'official')
    expect(result.ok).toBe(false)
  })
})

describe('normalizeTemplate — edge cases', () => {
  it('rejects non-object input', () => {
    expect(normalizeTemplate(null, 'official').ok).toBe(false)
    expect(normalizeTemplate('string', 'official').ok).toBe(false)
    expect(normalizeTemplate([], 'official').ok).toBe(false)
  })

  it('preserves authType when valid', () => {
    const result = normalizeTemplate(
      { name: 's', transportType: 'stdio', command: 'npx', args: [], authType: 'bearer' },
      'official',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.authType).toBe('bearer')
  })

  it('ignores invalid authType', () => {
    const result = normalizeTemplate(
      { name: 's', transportType: 'stdio', command: 'npx', args: [], authType: 'magic' },
      'official',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.template.authType).toBeUndefined()
  })
})

describe('normalizeTemplate — path hardening', () => {
  const base = { name: 'srv', transportType: 'stdio', args: [] }

  it('accepts relative commands resolved on PATH (npx, node, python3)', () => {
    expect(normalizeTemplate({ ...base, command: 'npx' }, 'community').ok).toBe(true)
    expect(normalizeTemplate({ ...base, command: 'node' }, 'community').ok).toBe(true)
    expect(normalizeTemplate({ ...base, command: 'python3' }, 'community').ok).toBe(true)
  })

  it('accepts /usr/bin/ commands', () => {
    expect(normalizeTemplate({ ...base, command: '/usr/bin/env' }, 'official').ok).toBe(true)
  })

  it('accepts /usr/local/bin/ commands', () => {
    expect(normalizeTemplate({ ...base, command: '/usr/local/bin/node' }, 'official').ok).toBe(true)
  })

  it('accepts /opt/homebrew/bin/ commands', () => {
    expect(normalizeTemplate({ ...base, command: '/opt/homebrew/bin/python3' }, 'official').ok).toBe(true)
  })

  it('accepts /Users/<name>/.local/bin/ commands', () => {
    expect(normalizeTemplate({ ...base, command: '/Users/alice/.local/bin/mytool' }, 'community').ok).toBe(true)
  })

  it('accepts /Users/<name>/Library/PhpWebStudy/env/node/bin/ commands', () => {
    expect(normalizeTemplate({ ...base, command: '/Users/bob/Library/PhpWebStudy/env/node/bin/node' }, 'community').ok).toBe(true)
  })

  it('rejects /tmp/evil', () => {
    const result = normalizeTemplate({ ...base, command: '/tmp/evil' }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/outside known-safe roots/)
  })

  it('rejects /var/tmp/ paths', () => {
    expect(normalizeTemplate({ ...base, command: '/var/tmp/script' }, 'community').ok).toBe(false)
  })

  it('rejects path traversal (..)', () => {
    const result = normalizeTemplate({ ...base, command: '/usr/bin/../bin/sh' }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/path traversal/)
  })

  it('rejects control char \\x00 in command', () => {
    const result = normalizeTemplate({ ...base, command: 'npx\x00evil' }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/control char/)
  })

  it('rejects control char in args', () => {
    const result = normalizeTemplate({ ...base, command: 'npx', args: ['\x01bad'] }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/control char/)
  })
})

describe('normalizeTemplate — shell-wrapper + interpreter rejection', () => {
  const base = { name: 'srv', transportType: 'stdio' }

  it('rejects bash + -lc <payload>', () => {
    const result = normalizeTemplate({ ...base, command: 'bash', args: ['-lc', 'curl evil'] }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/inline-exec/)
  })

  it('rejects sh + -c', () => {
    const result = normalizeTemplate({ ...base, command: 'sh', args: ['-c', 'id'] }, 'community')
    expect(result.ok).toBe(false)
  })

  it('rejects zsh + --command', () => {
    const result = normalizeTemplate({ ...base, command: 'zsh', args: ['--command', 'id'] }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/inline-exec/)
  })

  it('rejects python + -c <payload>', () => {
    const result = normalizeTemplate({ ...base, command: 'python', args: ['-c', 'import os; os.system("id")'] }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/inline-exec/)
  })

  it('rejects python3 + -c', () => {
    expect(normalizeTemplate({ ...base, command: 'python3', args: ['-c', 'pass'] }, 'community').ok).toBe(false)
  })

  it('rejects node + -e <payload>', () => {
    const result = normalizeTemplate({ ...base, command: 'node', args: ['-e', 'require("child_process").exec("id")'] }, 'community')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/inline-exec/)
  })

  it('rejects node + --eval', () => {
    expect(normalizeTemplate({ ...base, command: 'node', args: ['--eval', 'process.exit()'] }, 'community').ok).toBe(false)
  })

  it('rejects perl + -e', () => {
    expect(normalizeTemplate({ ...base, command: 'perl', args: ['-e', 'system("id")'] }, 'community').ok).toBe(false)
  })

  it('rejects ruby + -e', () => {
    expect(normalizeTemplate({ ...base, command: 'ruby', args: ['-e', 'exec("id")'] }, 'community').ok).toBe(false)
  })

  it('accepts bash without inline-exec flag (e.g. bash script.sh)', () => {
    expect(normalizeTemplate({ ...base, command: 'bash', args: ['script.sh'] }, 'community').ok).toBe(true)
  })

  it('accepts node without inline-exec flag (e.g. node server.js)', () => {
    expect(normalizeTemplate({ ...base, command: 'node', args: ['server.js'] }, 'community').ok).toBe(true)
  })
})
