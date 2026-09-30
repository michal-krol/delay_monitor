// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebarCollapsed } from './useSidebarCollapsed'

const STORAGE_KEY = 'pkp.sidebarCollapsed.v1'

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toggle() przełącza stan także wtedy, gdy localStorage odrzuca zapis', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useSidebarCollapsed())
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
  })

  it('domyślnie rozwinięty, gdy nic nie ma w localStorage', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(false)
  })

  it('toggle() przełącza stan i zapisuje go w localStorage', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('odczytuje poprzednio zapisany stan przy montowaniu', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(true)
  })

  it('uszkodzony wpis w localStorage nie wywraca hooka — wraca do domyślnego "rozwinięty"', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"nie":"boolean"}')
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(false)
  })
})
