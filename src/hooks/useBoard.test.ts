// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoard } from './useBoard'
import { jsonResponse } from '@/test-utils/http'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('useBoard', () => {
  it('fetches immediately on mount', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(result.current.data).not.toBeNull())

    expect(fetchMock).toHaveBeenCalledWith('/api/board?stations=5100')
  })

  it('exposes the time of the last successful fetch, null before the first one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' })))

    const startedAt = Date.now()
    const { result } = renderHook(() => useBoard(['5100']))
    expect(result.current.lastSuccessAt).toBeNull()
    await vi.waitFor(() => expect(result.current.data).not.toBeNull())

    // `waitFor` przesuwa fałszywy zegar, więc okno, nie równość.
    expect(result.current.lastSuccessAt).toBeGreaterThanOrEqual(startedAt)
    expect(result.current.lastSuccessAt).toBeLessThanOrEqual(Date.now())
  })

  it('refetches every 30 seconds while visible', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not refetch while document.hidden is true', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    await vi.advanceTimersByTimeAsync(30000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetches immediately on mount even if the tab starts out hidden (e.g. opened in a background tab)', async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // Kolejne, zaplanowane odpytanie za to już respektuje ukrycie karty.
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sets an error message when the fetch fails, without clearing prior data', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ snapshots: [{ stationId: '5100' }], budget: undefined, status: 'ok' }))
      .mockImplementationOnce(() => Promise.reject(new Error('network down')))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(result.current.data).not.toBeNull())

    await vi.advanceTimersByTimeAsync(30000)
    await vi.waitFor(() => expect(result.current.error).toBe('network down'))

    expect(result.current.data?.snapshots[0]).toEqual({ stationId: '5100' })
  })

  it('retries quickly (not after 30s) while a snapshot is still null and status is ok', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('falls back to the normal 30s cadence once data arrives', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ snapshots: [null], budget: undefined, status: 'ok' }))
      .mockImplementation(() => jsonResponse({ snapshots: [{ stationId: '5100' }], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // still loading -> fast retry

    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).toHaveBeenCalledTimes(3) // real data arrived -> back to 30s cadence, not another fast retry
  })

  it('does not fast-retry when a snapshot is null but the poller reports configError', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null], budget: undefined, status: 'configError' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // no fast retry -- retrying quickly won't fix a config error

    await vi.advanceTimersByTimeAsync(29000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // normal 30s cadence
  })

  it('stops fast-retrying after 3 attempts and falls back to the normal cadence', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000) // retry 1
    await vi.advanceTimersByTimeAsync(2000) // retry 2
    await vi.advanceTimersByTimeAsync(4000) // retry 3
    expect(fetchMock).toHaveBeenCalledTimes(4)

    await vi.advanceTimersByTimeAsync(29000)
    expect(fetchMock).toHaveBeenCalledTimes(4) // budget exhausted, waiting out the full 30s now

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('board request encodes the station list', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBoard(['5100', '5136']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(fetchMock).toHaveBeenCalledWith('/api/board?stations=5100%2C5136')
  })

  it('switching stations shows the loading state, not the previous station rows (keyed reset)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes('5100') && !url.includes('5136')
        ? jsonResponse({ snapshots: [{ stationId: '5100' }], budget: undefined, status: 'ok' })
        : new Promise(() => {}) // druga stacja: odpowiedź jeszcze nie przyszła
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ stationIds }) => useBoard(stationIds), { initialProps: { stationIds: ['5100'] } })
    await vi.waitFor(() => expect(result.current.data).not.toBeNull())

    rerender({ stationIds: ['5136'] })
    expect(result.current.data).toBeNull() // nie wiersze poprzedniej stacji
  })

  it('clears stale data and does not fetch when watching zero stations', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ stationIds }) => useBoard(stationIds), { initialProps: { stationIds: ['5100'] } })
    await vi.waitFor(() => expect(result.current.data).not.toBeNull())

    fetchMock.mockClear()
    rerender({ stationIds: [] })
    expect(result.current.data).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
