// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetCityContext, useCityContext } from './useCityContext'

beforeEach(() => {
  window.localStorage.clear()
  __resetCityContext()
})

describe('useCityContext', () => {
  it('defaults to null (not yet chosen) with nothing stored', async () => {
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.city).toBeNull()
  })

  it('persists a selection to localStorage and shares it between hook instances', async () => {
    const { result: a } = renderHook(() => useCityContext())
    const { result: b } = renderHook(() => useCityContext())
    await waitFor(() => expect(a.current.loaded).toBe(true))

    act(() => a.current.setCity('warszawa'))
    expect(a.current.city).toBe('warszawa')
    expect(b.current.city).toBe('warszawa')
    expect(JSON.parse(window.localStorage.getItem('monitor.cityContext.v2') ?? 'null')).toBe('warszawa')

    act(() => a.current.setCity(null))
    expect(window.localStorage.getItem('monitor.cityContext.v2')).toBeNull()
    expect(b.current.city).toBeNull()
  })

  it('hydrates from a previously stored city', async () => {
    window.localStorage.setItem('monitor.cityContext.v2', JSON.stringify('krakow'))
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.city).toBe('krakow')
  })

  it('silently ignores a corrupted stored value', async () => {
    window.localStorage.setItem('monitor.cityContext.v2', '"WAW invalid!!"')
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.city).toBeNull()
  })

  it('does not touch the URL', async () => {
    window.history.replaceState(null, '', '/miasto/warszawa')
    const { result } = renderHook(() => useCityContext())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    act(() => result.current.setCity('warszawa'))
    expect(window.location.search).toBe('')
  })
})
