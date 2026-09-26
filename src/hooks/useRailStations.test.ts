// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRailStations } from './useRailStations'
import { jsonResponse } from '@/test-utils/http'
import type { RailStationApiEntry } from '@/lib/board/railStationPin'

const STATION: RailStationApiEntry = {
  id: '33605',
  name: 'Warszawa Centralna',
  lat: 52.2288207,
  lon: 21.00316,
  coordSource: 'station',
  status: 'onTime',
  nextDepartures: [],
  ageMs: 1000,
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useRailStations', () => {
  it('starts with an empty list, then populates after the fetch resolves', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [STATION] }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRailStations('warszawa'))

    expect(result.current.stations).toEqual([])
    await vi.waitFor(() => expect(result.current.stations).toHaveLength(1))
    expect(result.current.stations[0].id).toBe('33605')
    expect(result.current.stations[0].mode).toBe('rail')
    expect(fetchMock).toHaveBeenCalledWith('/api/rail-stations?city=warszawa')
  })

  it('polls again after 90 s', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [STATION] }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useRailStations('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sets error on a rejected fetch but keeps the last stations', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ stations: [STATION] }))
      .mockImplementationOnce(() => Promise.reject(new Error('network')))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRailStations('warszawa'))
    await vi.waitFor(() => expect(result.current.stations).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(90_000)
    await vi.waitFor(() => expect(result.current.error).toBe('network'))
    expect(result.current.stations).toHaveLength(1)
  })

  it('surfaces a non-ok response as an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRailStations('warszawa'))
    await vi.waitFor(() => expect(result.current.error).toBe('500'))
  })

  it('does not update state or reschedule after unmount while a fetch is in flight', async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = renderHook(() => useRailStations('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    unmount()
    resolveFetch({ ok: true, json: () => Promise.resolve({ stations: [STATION] }) })
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // odmontowany -> brak reschedule
  })

  it('does not set an error after unmount while a fetch is failing', async () => {
    let rejectFetch!: (reason: Error) => void
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = renderHook(() => useRailStations('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    unmount()
    rejectFetch(new Error('network'))
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // odmontowany -> brak reschedule po błędzie
  })

  it('falls back to a generic error message for a non-Error rejection', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => Promise.reject('boom'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRailStations('warszawa'))
    await vi.waitFor(() => expect(result.current.error).toBe('błąd'))
  })

  it('skips a tick while the tab is hidden, reschedules instead of fetching', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [STATION] }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useRailStations('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
