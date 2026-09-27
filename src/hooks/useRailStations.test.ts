// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRailStationStatus, useRailStations } from './useRailStations'
import { jsonResponse } from '@/test-utils/http'

const STATION = { id: '33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0, tier: 1 }
const STATUS = { id: '33605', status: 'onTime', nextDepartures: [], ageMs: 1000 }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useRailStations', () => {
  it('is loading (null, no error) until the list arrives, then fetches only once', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [STATION] }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRailStations())
    expect(result.current).toEqual({ stations: null, error: false })
    await vi.waitFor(() => expect(result.current.stations).toEqual([STATION]))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/rail-stations/list')
  })

  it('reports an error distinctly from loading and retries after 30 s', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(new Response('', { status: 500 })))
      .mockImplementation(() => jsonResponse({ stations: [STATION] }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRailStations())
    await vi.waitFor(() => expect(result.current).toEqual({ stations: null, error: true }))
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.waitFor(() => expect(result.current).toEqual({ stations: [STATION], error: false }))
  })
})

describe('useRailStationStatus', () => {
  it('does not fetch while no station card is open', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useRailStationStatus(null))
    await vi.advanceTimersByTimeAsync(100_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the station status, null when the poller does not hold it, and polls every 90 s', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [STATUS] }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ id }) => useRailStationStatus(id), { initialProps: { id: '33605' as string | null } })
    expect(result.current.status).toBeUndefined()
    await vi.waitFor(() => expect(result.current.status).toEqual(STATUS))

    rerender({ id: '80416' })
    expect(result.current.status).toBeUndefined()
    await vi.waitFor(() => expect(result.current.status).toBeNull())

    const calls = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock.mock.calls.length).toBe(calls + 1)
  })

  it('flags an error without inventing a status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.reject(new Error('net'))))
    const { result } = renderHook(() => useRailStationStatus('33605'))
    await vi.waitFor(() => expect(result.current).toEqual({ status: undefined, error: true }))
  })
})
