// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useViewTransitions } from './useViewTransitions'

const original = window.matchMedia

function stubReducedMotion(reduced: boolean): void {
  window.matchMedia = (() => ({ matches: reduced, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
}

function stubEngine({ startViewTransition, userAgentData }: { startViewTransition: boolean; userAgentData: boolean }): void {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition ? () => {} : undefined })
  // `in` sprawdza istnienie własności, więc „brak” = usunięta, nie `undefined`.
  if (userAgentData) Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: {} })
  else Reflect.deleteProperty(navigator, 'userAgentData')
}

afterEach(() => {
  window.matchMedia = original
  Reflect.deleteProperty(document, 'startViewTransition')
  Reflect.deleteProperty(navigator, 'userAgentData')
  vi.restoreAllMocks()
})

describe('useViewTransitions', () => {
  it('is on in a Chromium engine (View Transitions + userAgentData) when motion is allowed', () => {
    stubReducedMotion(false)
    stubEngine({ startViewTransition: true, userAgentData: true })
    expect(renderHook(() => useViewTransitions()).result.current).toBe(true)
  })

  it('is off under reduced motion', () => {
    stubReducedMotion(true)
    stubEngine({ startViewTransition: true, userAgentData: true })
    expect(renderHook(() => useViewTransitions()).result.current).toBe(false)
  })

  it('is off without startViewTransition (Firefox, old browsers)', () => {
    stubReducedMotion(false)
    stubEngine({ startViewTransition: false, userAgentData: true })
    expect(renderHook(() => useViewTransitions()).result.current).toBe(false)
  })

  it('is off in WebKit (no userAgentData): its view-transition implementation crashed the page in Playwright WebKit', () => {
    stubReducedMotion(false)
    stubEngine({ startViewTransition: true, userAgentData: false })
    expect(renderHook(() => useViewTransitions()).result.current).toBe(false)
  })
})
