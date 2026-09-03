// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCityStats } from './useCityStats'
import { jsonResponse } from '@/test-utils/http'

const body = (state: 'ready' | 'loading' | 'failed') =>
  jsonResponse({ city: 'warszawa', state, stats: state === 'ready' ? { tripsToday: 10 } : null })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCityStats', () => {
  it('does not fetch when the city is null', async () => {
    const fetchMock = vi.fn().mockImplementation(() => body('ready'))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useCityStats(null))
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches once for a ready feed and does not retry', async () => {
    const fetchMock = vi.fn().mockImplementation(() => body('ready'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityStats('warszawa'))
    await vi.waitFor(() => expect(result.current.data?.state).toBe('ready'))
    await vi.advanceTimersByTimeAsync(20000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/city-stats?city=warszawa')
  })

  it('retries on the loading backoff', async () => {
    const fetchMock = vi.fn().mockImplementation(() => body('loading'))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useCityStats('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces a fetch error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityStats('warszawa'))
    await vi.waitFor(() => expect(result.current.error).toBe('network'))
  })

  it('surfaces a non-ok response as an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityStats('warszawa'))
    await vi.waitFor(() => expect(result.current.error).toBe('500'))
  })
})
