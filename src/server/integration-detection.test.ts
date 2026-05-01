import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectHonchoIntegration } from './integration-detection'

const tempDirs: Array<string> = []

function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'honcho-detect-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('detectHonchoIntegration', () => {
  it('keeps Honcho disabled when no local presence or config exists', () => {
    const homeDir = tempHome()
    const status = detectHonchoIntegration({
      env: {},
      homeDir,
      openClawHome: path.join(homeDir, '.openclaw'),
      hermesHome: path.join(homeDir, '.hermes'),
      now: 1,
    })

    expect(status.mode).toBe('not-detected')
    expect(status.available).toBe(false)
    expect(status.configured).toBe(false)
    expect(status.safeToUse).toBe(false)
  })

  it('detects local Honcho presence without enabling unsafe use', () => {
    const homeDir = tempHome()
    fs.mkdirSync(path.join(homeDir, '.honcho'), { recursive: true })

    const status = detectHonchoIntegration({
      env: {},
      homeDir,
      openClawHome: path.join(homeDir, '.openclaw'),
      hermesHome: path.join(homeDir, '.hermes'),
      now: 1,
    })

    expect(status.mode).toBe('detected-unconfigured')
    expect(status.available).toBe(true)
    expect(status.configured).toBe(false)
    expect(status.safeToUse).toBe(false)
  })

  it('detects Honcho config from OpenClaw env/config without exposing secret values', () => {
    const homeDir = tempHome()
    const openClawHome = path.join(homeDir, '.openclaw')
    fs.mkdirSync(openClawHome, { recursive: true })
    fs.writeFileSync(path.join(openClawHome, '.env'), 'HONCHO_API_KEY=secret-value\n')
    fs.writeFileSync(path.join(openClawHome, 'config.yaml'), 'honcho:\n  enabled: true\n')

    const status = detectHonchoIntegration({
      env: {},
      homeDir,
      openClawHome,
      hermesHome: path.join(homeDir, '.hermes'),
      now: 1,
    })

    expect(status.mode).toBe('ready')
    expect(status.configured).toBe(true)
    expect(status.safeToUse).toBe(true)
    expect(status.sources.some((source) => source.id === 'openclaw-env' && source.configured)).toBe(true)
    expect(status.sources.some((source) => source.id === 'openclaw-config' && source.configured)).toBe(true)
    expect(JSON.stringify(status)).not.toContain('secret-value')
  })
})
