// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSectionOpen } from './useSectionOpen'

const KEY = 'monitor.linesSections.v1'

function mockNarrow(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: narrow && query === '(max-width: 767px)', media: query })),
  )
}

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(KEY) ?? 'null')
}

beforeEach(() => {
  window.localStorage.clear()
  mockNarrow(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useSectionOpen', () => {
  it('desktop: a section with up to 30 lines is open by default', () => {
    const { result } = renderHook(() => useSectionOpen())
    expect(result.current.isOpen('metro', 1)).toBe(true)
    expect(result.current.isOpen('tram', 30)).toBe(true)
  })

  it('desktop: a section with more than 30 lines is closed by default', () => {
    const { result } = renderHook(() => useSectionOpen())
    expect(result.current.isOpen('bus', 31)).toBe(false)
  })

  it('narrow screen: every section is closed by default', () => {
    mockNarrow(true)
    const { result } = renderHook(() => useSectionOpen())
    expect(result.current.isOpen('metro', 1)).toBe(false)
    expect(result.current.isOpen('tram', 30)).toBe(false)
  })

  it('a stored value wins over the default, on narrow and wide', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ bus: true, metro: false }))
    mockNarrow(true)
    const { result: onNarrow } = renderHook(() => useSectionOpen())
    expect(onNarrow.current.isOpen('bus', 200)).toBe(true)
    mockNarrow(false)
    const { result: onWide } = renderHook(() => useSectionOpen())
    expect(onWide.current.isOpen('metro', 1)).toBe(false)
  })

  it('corrupt JSON falls back to defaults', () => {
    window.localStorage.setItem(KEY, '{oops')
    const { result } = renderHook(() => useSectionOpen())
    expect(result.current.isOpen('metro', 1)).toBe(true)
    expect(result.current.isOpen('bus', 99)).toBe(false)
  })

  it('drops non-boolean values and over-long keys, keeps good ones', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ metro: 'yes', bus: false, ['x'.repeat(41)]: true }))
    const { result } = renderHook(() => useSectionOpen())
    expect(result.current.isOpen('metro', 1)).toBe(true) // bad value dropped -> default
    expect(result.current.isOpen('bus', 1)).toBe(false) // good value kept
    act(() => result.current.setOpen('tram', false))
    expect(stored()).toEqual({ bus: false, tram: false })
  })

  it('setOpen persists and updates state, one write per call', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useSectionOpen())
    act(() => result.current.setOpen('bus:night', true))
    expect(result.current.isOpen('bus:night', 99)).toBe(true)
    expect(stored()).toEqual({ 'bus:night': true })
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('setOpen to the value already stored does not write again', () => {
    const { result } = renderHook(() => useSectionOpen())
    act(() => result.current.setOpen('metro', false))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    act(() => result.current.setOpen('metro', false))
    expect(setItem).not.toHaveBeenCalled()
  })

  it('refuses a bad key instead of persisting it', () => {
    const { result } = renderHook(() => useSectionOpen())
    act(() => result.current.setOpen('x'.repeat(41), true))
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps state in memory when localStorage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useSectionOpen())
    act(() => result.current.setOpen('metro', false))
    expect(result.current.isOpen('metro', 1)).toBe(false)
  })

  it('does not crash when localStorage refuses the read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const { result } = renderHook(() => useSectionOpen())
    expect(result.current.isOpen('metro', 1)).toBe(true)
  })

  it('works when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useSectionOpen())
    expect(result.current.isOpen('metro', 1)).toBe(true)
  })
})
