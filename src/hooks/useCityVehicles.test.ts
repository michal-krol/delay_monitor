// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCityVehicles } from './useCityVehicles'
import { jsonResponse } from '@/test-utils/http'

const VEHICLE = {
  id: 'v1',
  lat: 52.23,
  lon: 21.01,
  bearing: null,
  sideNumber: '3801',
  ageSec: 12,
  headsign: 'Centrum',
  routeId: '20',
  shortName: '20',
  mode: 'tram' as const,
  color: null,
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCityVehicles', () => {
  it('starts with an empty list, then populates after the fetch resolves', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 5000 } }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCityVehicles('warszawa'))

    expect(result.current.vehicles).toEqual([])
    await vi.waitFor(() => expect(result.current.vehicles).toHaveLength(1))
    expect(result.current.vehicles[0].sideNumber).toBe('3801')
    expect(result.current.feed).toEqual({ state: 'ready', ageMs: 5000 })
    expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/city-vehicles?city=warszawa')
  })

  it('polls again after 15 s', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 5000 } }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useCityVehicles('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sets error on a rejected fetch but keeps the last vehicles', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 5000 } }))
      .mockImplementationOnce(() => Promise.reject(new Error('network')))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCityVehicles('warszawa'))
    await vi.waitFor(() => expect(result.current.vehicles).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(15_000)
    await vi.waitFor(() => expect(result.current.error).toBe('network'))
    expect(result.current.vehicles).toHaveLength(1)
  })

  it('falls back to a generic error message for a non-Error rejection', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => Promise.reject('boom'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityVehicles('warszawa'))
    await vi.waitFor(() => expect(result.current.error).toBe('błąd'))
  })

  it('surfaces a non-ok response as an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityVehicles('warszawa'))
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

    const { unmount } = renderHook(() => useCityVehicles('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    unmount()
    resolveFetch({ ok: true, json: () => Promise.resolve({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 0 } }) })
    await vi.advanceTimersByTimeAsync(15_000)
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

    const { unmount } = renderHook(() => useCityVehicles('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    unmount()
    rejectFetch(new Error('network'))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // odmontowany -> brak reschedule po błędzie
  })

  it('skips a tick while the tab is hidden, reschedules instead of fetching', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 5000 } }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useCityVehicles('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // hidden -> nie odpytał

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // widoczny znów -> wznowił
  })
})
