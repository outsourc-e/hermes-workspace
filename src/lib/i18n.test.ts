import { describe, expect, it } from 'vitest'
import { LOCALE_LABELS, t, type LocaleId } from './i18n'

function withLocale<T>(locale: LocaleId, fn: () => T): T {
  const originalWindow = globalThis.window
  const originalNavigator = globalThis.navigator
  const store = new Map<string, string>([['hermes-workspace-locale', locale]])
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' },
  })
  try {
    return fn()
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  }
}

describe('i18n translations', () => {
  it('uses Simplified Chinese labels for wired navigation keys', () => {
    withLocale('zh', () => {
      expect(t('nav.dashboard')).toBe('仪表板')
      expect(t('nav.profiles')).toBe('配置文件')
    })
  })

  it('uses Russian labels instead of falling back to English', () => {
    withLocale('ru', () => {
      expect(t('nav.dashboard')).toBe('Панель')
      expect(t('settings.language')).toBe('Язык')
    })
  })

  it('uses Japanese labels instead of falling back to English', () => {
    withLocale('ja', () => {
      expect(t('nav.dashboard')).toBe('ダッシュボード')
      expect(t('settings.language')).toBe('言語')
    })
  })

  it('exposes readable locale labels for contributor-targeted languages', () => {
    expect(LOCALE_LABELS.zh).toBe('中文')
    expect(LOCALE_LABELS.ru).toBe('Русский')
  })
})
