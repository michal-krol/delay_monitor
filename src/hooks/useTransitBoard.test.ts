// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTransitBoard } from './useTransitBoard'
import { jsonResponse } from '@/test-utils/http'

const ready = (state: 'ready' | 'loading' = 'ready') =>
  jsonResponse({
    city: 'warszawa',
    schedule: { state, loadedAt: null, ageMs: null, phase: state === 'loading' ? 'stop_times' : null, serviceDates: null, feedVersion: null },
    stops: [],
    attribution: [],
  })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('useTransitBoard', () => {
  it('does not fetch when the city is null or there are no stops', async () => {
    const fetchMock = vi.fn().mockImplementation(ready)
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useTransitBoard(null, ['1001']))
    renderHook(() => useTransitBoard('warszawa', []))
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the board for a city and stop set', async () => {
    const fetchMock = vi.fn().mockImplementation(ready)
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useTransitBoard('warszawa', ['1001', '7014M'], 15))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/board?city=warszawa&stops=1001,7014M&limit=15'))
  })

  it('retries quickly on the loading backoff, then settles to the refresh interval', async () => {
    const fetchMock = vi.fn().mockImplementation(() => ready('loading'))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useTransitBoard('warszawa', ['1001']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces a fetch error without discarding the hook', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useTransitBoard('warszawa', ['1001']))
    await vi.waitFor(() => expect(result.current.error).toBe('network'))
  })
})
