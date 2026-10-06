// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SM_UP, useMediaQuery } from './useMediaQuery'

const original = window.matchMedia

afterEach(() => {
  window.matchMedia = original
})

/** Atrapa `matchMedia` z ręcznym przełączaniem dopasowania. */
function stubMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  window.matchMedia = (() => ({
    get matches() {
      return matches
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })) as unknown as typeof window.matchMedia
  return (next: boolean) => {
    matches = next
    listeners.forEach((cb) => cb())
  }
}

describe('useMediaQuery', () => {
  it('reads the query and follows its changes', () => {
    const set = stubMedia(false)
    const { result } = renderHook(() => useMediaQuery(SM_UP, true))
    expect(result.current).toBe(false)
    act(() => set(true))
    expect(result.current).toBe(true)
  })

  it('falls back to the server value without matchMedia (old browsers, jsdom)', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    expect(renderHook(() => useMediaQuery(SM_UP, true)).result.current).toBe(true)
    expect(renderHook(() => useMediaQuery(SM_UP, false)).result.current).toBe(false)
  })
})
