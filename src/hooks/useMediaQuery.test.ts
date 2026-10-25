// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SM_UP, useMediaQuery, useReducedMotion } from './useMediaQuery'

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
  it('keeps its subscription across rerenders and replaces it when the query changes', () => {
    const add = vi.fn()
    const remove = vi.fn()
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: add,
      removeEventListener: remove,
    })) as unknown as typeof window.matchMedia
    const { rerender, unmount } = renderHook(
      ({ query }) => useMediaQuery(query, false),
      { initialProps: { query: SM_UP } }
    )
    rerender({ query: SM_UP })
    rerender({ query: SM_UP })
    expect(add).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
    rerender({ query: '(min-width: 64rem)' })
    expect(add).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(1)
    unmount()
    expect(remove).toHaveBeenCalledTimes(2)
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1])
    expect(remove.mock.calls[1][1]).toBe(add.mock.calls[1][1])
  })

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

describe('useReducedMotion', () => {
  it('follows prefers-reduced-motion changes', () => {
    const set = stubMedia(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    act(() => set(true))
    expect(result.current).toBe(true)
  })

  it('is false without matchMedia (no motion preference to respect)', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false)
  })
})
