// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecentLines } from './useRecentLines'

const KEY = 'monitor.recentLines.v1'

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(KEY) ?? 'null')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useRecentLines', () => {
  it('starts empty when nothing is stored', async () => {
    const { result } = renderHook(() => useRecentLines('warszawa'))
    await waitFor(() => expect(result.current.recent).toEqual([]))
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('one city with a non-array value does not drop the other cities', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ krakow: 'oops', warszawa: ['131', 'M1'] }))
    const { result } = renderHook(() => useRecentLines('warszawa'))
    await waitFor(() => expect(result.current.recent).toEqual(['131', 'M1']))
    act(() => result.current.record('4'))
    expect(stored()).toEqual({ warszawa: ['4', '131', 'M1'] })
  })

  it('corrupt JSON gives an empty list, not a crash', async () => {
    window.localStorage.setItem(KEY, '{nie json')
    const { result } = renderHook(() => useRecentLines('warszawa'))
    await waitFor(() => expect(result.current.recent).toEqual([]))
    act(() => result.current.record('131'))
    expect(result.current.recent).toEqual(['131'])
  })

  it('a wrong-shaped payload (array, number) gives an empty list', async () => {
    window.localStorage.setItem(KEY, '[1,2]')
    const { result } = renderHook(() => useRecentLines('warszawa'))
    await waitFor(() => expect(result.current.recent).toEqual([]))
    act(() => result.current.record('131'))
    expect(stored()).toEqual({ warszawa: ['131'] })
  })

  it('drops a bad route id and keeps the good ones', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ warszawa: ['131', '../x', 7, 'M1'] }))
    const { result } = renderHook(() => useRecentLines('warszawa'))
    await waitFor(() => expect(result.current.recent).toEqual(['131', 'M1']))
  })

  it('caps stored entries at 6 when reading', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ warszawa: ['1', '2', '3', '4', '5', '6', '7', '8'] }))
    const { result } = renderHook(() => useRecentLines('warszawa'))
    await waitFor(() => expect(result.current.recent).toEqual(['1', '2', '3', '4', '5', '6']))
  })

  it('the 7th line pushes out the oldest', () => {
    const { result } = renderHook(() => useRecentLines('warszawa'))
    for (const id of ['1', '2', '3', '4', '5', '6', '7']) act(() => result.current.record(id))
    expect(result.current.recent).toEqual(['7', '6', '5', '4', '3', '2'])
    expect(stored()).toEqual({ warszawa: ['7', '6', '5', '4', '3', '2'] })
  })

  it('revisiting a line moves it to the front without duplicating', () => {
    const { result } = renderHook(() => useRecentLines('warszawa'))
    for (const id of ['1', '2', '3']) act(() => result.current.record(id))
    act(() => result.current.record('1'))
    expect(result.current.recent).toEqual(['1', '3', '2'])
  })

  it('refuses to record an id that fails the route pattern', () => {
    const { result } = renderHook(() => useRecentLines('warszawa'))
    act(() => result.current.record('../../etc'))
    expect(result.current.recent).toEqual([])
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps other cities when one city is written, and drops invalid city keys', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ krakow: ['50'], 'BAD KEY': ['1'] }))
    const { result } = renderHook(() => useRecentLines('warszawa'))
    act(() => result.current.record('131'))
    expect(stored()).toEqual({ krakow: ['50'], warszawa: ['131'] })
  })

  it('writes storage exactly once per record()', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useRecentLines('warszawa'))
    act(() => result.current.record('131'))
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('keeps the list in memory when localStorage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useRecentLines('warszawa'))
    act(() => result.current.record('131'))
    expect(result.current.recent).toEqual(['131'])
  })

  it('does not crash when localStorage refuses the read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const { result } = renderHook(() => useRecentLines('warszawa'))
    expect(result.current.recent).toEqual([])
    act(() => result.current.record('131'))
    expect(result.current.recent).toEqual(['131'])
  })

  it('switching city shows that city list', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ warszawa: ['131'], krakow: ['50'] }))
    const { result, rerender } = renderHook(({ city }) => useRecentLines(city), { initialProps: { city: 'warszawa' } })
    await waitFor(() => expect(result.current.recent).toEqual(['131']))
    rerender({ city: 'krakow' })
    await waitFor(() => expect(result.current.recent).toEqual(['50']))
  })
})
