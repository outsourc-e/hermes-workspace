// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRouterBasepath } from './router'

function setBasepathGlobal(value: unknown) {
  ;(window as unknown as Record<string, unknown>).__HERMES_WORKSPACE_BASEPATH__ =
    value
}

function clearBasepathGlobal() {
  delete (window as unknown as Record<string, unknown>)
    .__HERMES_WORKSPACE_BASEPATH__
}

afterEach(() => {
  clearBasepathGlobal()
})

describe('resolveRouterBasepath', () => {
  it('returns "/" when no global override is set', () => {
    clearBasepathGlobal()
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('returns "/" when the global is not a string', () => {
    setBasepathGlobal(42)
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('returns "/" when the global is an empty or whitespace string', () => {
    setBasepathGlobal('   ')
    expect(resolveRouterBasepath()).toBe('/')
  })

  it('normalizes a valid prefix with a leading slash and no trailing slash', () => {
    setBasepathGlobal('/workspaces/abc/')
    expect(resolveRouterBasepath()).toBe('/workspaces/abc')
  })

  it('adds a leading slash if one is missing', () => {
    setBasepathGlobal('workspaces/abc')
    expect(resolveRouterBasepath()).toBe('/workspaces/abc')
  })

  it('collapses multiple trailing slashes', () => {
    setBasepathGlobal('/workspaces/abc////')
    expect(resolveRouterBasepath()).toBe('/workspaces/abc')
  })
})
