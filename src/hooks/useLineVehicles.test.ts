// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLineVehicles } from './useLineVehicles'
import { jsonResponse } from '@/test-utils/http'

const VEHICLE = {
  sideNumber: '3801',
  tripId: 't1',
  routeId: '20',
  directionId: 0,
  afterStopOrder: 1,
  fraction: 0.4,
  ageSec: 12,
  headsign: 'Centrum',
  bearing: null,
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useLineVehicles', () => {
  it('starts with an empty list, then populates after the fetch resolves', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 5000 } }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useLineVehicles('warszawa', '20', 0))

    expect(result.current.vehicles).toEqual([])
    await vi.waitFor(() => expect(result.current.vehicles).toHaveLength(1))
    expect(result.current.vehicles[0].sideNumber).toBe('3801')
    expect(result.current.feed).toEqual({ state: 'ready', ageMs: 5000 })
    expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/vehicles?city=warszawa&route=20&direction=0')
  })

  it('polls again after 20 s', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 5000 } }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useLineVehicles('warszawa', '20', 0))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sets error on a rejected fetch but keeps the last vehicles', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 5000 } }))
      .mockImplementationOnce(() => Promise.reject(new Error('network')))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useLineVehicles('warszawa', '20', 0))
    await vi.waitFor(() => expect(result.current.vehicles).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.waitFor(() => expect(result.current.error).toBe('network'))
    expect(result.current.vehicles).toHaveLength(1)
  })

  it('surfaces a non-ok response as an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineVehicles('warszawa', '20', 0))
    await vi.waitFor(() => expect(result.current.error).toBe('500'))
  })

  it('does not fetch for an unknown direction (2)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ vehicles: [], feed: { state: 'ready', ageMs: 0 } }))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useLineVehicles('warszawa', '20', 2))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
