// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCityStops } from './useCityStops'
import { jsonResponse } from '@/test-utils/http'

const STOP = { id: '100101', groupId: '1001', name: 'Centrum', code: '01', lat: 52.23, lon: 21.01, mode: 'bus' }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCityStops', () => {
  it('retries every 2 s while the schedule is still loading, then keeps the list', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ stops: null }))
      .mockImplementation(() => jsonResponse({ stops: [STOP] }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityStops('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(result.current).toEqual({ stops: null, error: false })
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(result.current.stops).toEqual([STOP]))
    expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/stops?city=warszawa')
  })

  it('keeps retrying past the ladder while the schedule is still loading (never gives up)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stops: null }))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useCityStops('warszawa'))
    await vi.advanceTimersByTimeAsync(34_000) // drabinka 1+2+3+5+8+15 s = 7 zapytań
    expect(fetchMock).toHaveBeenCalledTimes(7)
    await vi.advanceTimersByTimeAsync(30_000) // dalej co 15 s
    expect(fetchMock).toHaveBeenCalledTimes(9)
  })

  it('reports an error distinctly from loading and retries after 30 s', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('net')))
      .mockImplementation(() => jsonResponse({ stops: [STOP] }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityStops('warszawa'))
    await vi.waitFor(() => expect(result.current).toEqual({ stops: null, error: true }))
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.waitFor(() => expect(result.current).toEqual({ stops: [STOP], error: false }))
  })
})
