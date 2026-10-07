// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installViewTransitionGate, resetViewTransitionGateForTests } from './viewTransitionGate'

const originalMatchMedia = window.matchMedia
let reduced = false
const listeners = new Set<() => void>()

function stubEngine({ native, userAgentData }: { native: ((arg?: unknown) => unknown) | undefined; userAgentData: boolean }): void {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: native })
  if (userAgentData) Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: {} })
  else Reflect.deleteProperty(navigator, 'userAgentData')
}

beforeEach(() => {
  reduced = false
  listeners.clear()
  window.matchMedia = (() => ({
    get matches() {
      return reduced
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  resetViewTransitionGateForTests()
  window.matchMedia = originalMatchMedia
  Reflect.deleteProperty(document, 'startViewTransition')
  Reflect.deleteProperty(navigator, 'userAgentData')
})

describe('view transition gate', () => {
  it('lets a Chromium engine call startViewTransition when motion is allowed (and keeps the page-installed function)', () => {
    const native = vi.fn(() => 'transition')
    stubEngine({ native, userAgentData: true })
    installViewTransitionGate()
    expect(typeof document.startViewTransition).toBe('function')
    const update = () => {}
    expect(document.startViewTransition(update)).toBe('transition')
    expect(native).toHaveBeenCalledWith(update)
  })

  it('hides startViewTransition from engines without userAgentData (WebKit crashed the page on it), so React skips transitions', () => {
    stubEngine({ native: vi.fn(), userAgentData: false })
    installViewTransitionGate()
    expect(document.startViewTransition).toBeUndefined()
  })

  it('hides it under prefers-reduced-motion, and follows a preference change without a reload', () => {
    stubEngine({ native: vi.fn(), userAgentData: true })
    installViewTransitionGate()
    expect(typeof document.startViewTransition).toBe('function')
    reduced = true
    expect(document.startViewTransition).toBeUndefined()
    reduced = false
    expect(typeof document.startViewTransition).toBe('function')
  })

  it('is idempotent and does nothing where the API does not exist', () => {
    stubEngine({ native: undefined, userAgentData: true })
    installViewTransitionGate()
    installViewTransitionGate()
    expect(document.startViewTransition).toBeUndefined()
  })

  it('wraps only once: a second install does not stack gates', () => {
    const native = vi.fn()
    stubEngine({ native, userAgentData: true })
    installViewTransitionGate()
    const first = Object.getOwnPropertyDescriptor(document, 'startViewTransition')?.get
    installViewTransitionGate()
    expect(first).toBeTypeOf('function')
    expect(Object.getOwnPropertyDescriptor(document, 'startViewTransition')?.get).toBe(first)
  })
})
