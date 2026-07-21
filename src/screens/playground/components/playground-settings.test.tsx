/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHORTCUTS, shouldToggleKeyboardHelp } from './keyboard-shortcuts-overlay'
import { DEFAULT_HERMESWORLD_SETTINGS, loadHermesWorldSettings, saveHermesWorldSettings } from './hermesworld-settings'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.style.removeProperty('--hermesworld-ui-scale')
  document.documentElement.style.removeProperty('--hermesworld-hud-opacity')
  document.documentElement.style.removeProperty('--hw-flash-rate')
  document.documentElement.className = ''
})

describe('HermesWorld keyboard shortcut handling', () => {
  it('maps help, jump, crouch, and settings shortcuts', () => {
    const entries = new Map(SHORTCUTS)
    expect(entries.get('?')).toBe('help')
    expect(entries.get('Space')).toBe('jump')
    expect(entries.get('Ctrl')).toBe('crouch')
    expect(entries.get('Esc')).toBe('settings')
  })

  it('toggles help on ? but ignores form fields', () => {
    expect(shouldToggleKeyboardHelp({ key: '?', shiftKey: false, target: window })).toBe(true)
    const input = document.createElement('input')
    expect(shouldToggleKeyboardHelp({ key: '?', shiftKey: false, target: input })).toBe(false)
  })
})

describe('HermesWorld settings persistence', () => {
  it('persists settings to localStorage and applies runtime variables', () => {
    saveHermesWorldSettings({
      ...DEFAULT_HERMESWORLD_SETTINGS,
      performance: { ...DEFAULT_HERMESWORLD_SETTINGS.performance, fpsCounter: true },
      display: { ...DEFAULT_HERMESWORLD_SETTINGS.display, uiScale: 125, hudOpacity: 72 },
      accessibility: { photosensitiveMode: true },
    })

    const stored = JSON.parse(window.localStorage.getItem('hermesworld:settings') || '{}')
    expect(stored.display.uiScale).toBe(125)
    expect(stored.display.hudOpacity).toBe(72)
    expect(stored.performance.fpsCounter).toBe(true)
    expect(stored.accessibility.photosensitiveMode).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--hermesworld-ui-scale')).toBe('1.25')
    expect(document.documentElement.style.getPropertyValue('--hermesworld-hud-opacity')).toBe('0.72')
    expect(document.documentElement.style.getPropertyValue('--hw-flash-rate')).toBe('0s')
    expect(document.documentElement.classList.contains('hermesworld-photosensitive')).toBe(true)
  })

  it('defaults photosensitive mode and reduced motion from prefers-reduced-motion on first load', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })

    const settings = loadHermesWorldSettings()
    expect(settings.performance.reducedMotion).toBe(true)
    expect(settings.accessibility.photosensitiveMode).toBe(true)
  })
})
