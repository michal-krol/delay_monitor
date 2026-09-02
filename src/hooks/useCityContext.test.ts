// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCityContext } from './useCityContext'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('useCityContext', () => {
  it('defaults to null (whole country — rail) with no stored or URL value', async () => {
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.city).toBeNull()
  })

  it('persists a selection to localStorage and the URL', async () => {
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.setCity('waw'))
    expect(result.current.city).toBe('waw')
    expect(JSON.parse(window.localStorage.getItem('monitor.cityContext.v1') ?? 'null')).toBe('waw')
    expect(window.location.search).toContain('miasto=waw')

    act(() => result.current.setCity(null))
    expect(window.localStorage.getItem('monitor.cityContext.v1')).toBeNull()
    expect(window.location.search).not.toContain('miasto')
  })

  it('lets a URL parameter win over a stored value', async () => {
    window.localStorage.setItem('monitor.cityContext.v1', JSON.stringify('waw'))
    window.history.replaceState(null, '', '/?miasto=krk')
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.city).toBe('krk')
  })

  it('silently ignores a corrupted stored value', async () => {
    window.localStorage.setItem('monitor.cityContext.v1', '"WAW invalid!!"')
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.city).toBeNull()
  })
})
