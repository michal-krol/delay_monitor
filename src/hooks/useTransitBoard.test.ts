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

  it('pauses while the tab is hidden and resumes on visibilitychange', async () => {
    const fetchMock = vi.fn().mockImplementation(ready)
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useTransitBoard('warszawa', ['1001']))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // hidden -> pauza, żadnego fetcha ani timera

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2) // widoczny znów -> wznowił od razu (bez czekania na kolejny tick)
  })

  // Trójstan `loading`/`failed` — jedna implementacja dla TransitStopDetail i
  // TransitStopCard (AGENTS.md #2, #7). Przeniesione tu z komponentów (były
  // zduplikowane, patrz task-4 fix round 1).
  describe('loading/failed', () => {
    it('is loading before the first response resolves', () => {
      const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useTransitBoard('warszawa', ['1001']))
      expect(result.current.loading).toBe(true)
      expect(result.current.failed).toBe(false)
    })

    it('stays loading while schedule.state is "loading", even though the response itself succeeded', async () => {
      const fetchMock = vi.fn().mockImplementation(() => ready('loading'))
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useTransitBoard('warszawa', ['1001']))
      await vi.waitFor(() => expect(result.current.data).not.toBeNull())
      expect(result.current.loading).toBe(true)
      expect(result.current.failed).toBe(false)
    })

    it('is neither loading nor failed once the schedule is ready', async () => {
      const fetchMock = vi.fn().mockImplementation(ready)
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useTransitBoard('warszawa', ['1001']))
      await vi.waitFor(() => expect(result.current.data).not.toBeNull())
      expect(result.current.loading).toBe(false)
      expect(result.current.failed).toBe(false)
    })

    it('is failed only when the first fetch has no data to fall back on', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('network'))
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useTransitBoard('warszawa', ['1001']))
      await vi.waitFor(() => expect(result.current.failed).toBe(true))
      expect(result.current.loading).toBe(false)
    })

    it('schedule failed on the server → failed', async () => {
      // GTFS poller's first load failed: `/api/gtfs/board` still answers 200,
      // but `schedule.state: 'failed'` and `stops: []` — that must not read as
      // an empty timetable (AGENTS.md #7).
      const fetchMock = vi.fn().mockImplementation(() =>
        jsonResponse({
          city: 'warszawa',
          schedule: { state: 'failed', loadedAt: null, ageMs: null, phase: null, serviceDates: null, feedVersion: null },
          stops: [],
          attribution: [],
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useTransitBoard('warszawa', ['1001']))
      await vi.waitFor(() => expect(result.current.data).not.toBeNull())
      expect(result.current.failed).toBe(true)
      expect(result.current.loading).toBe(false)
    })

    it('keeps the last good snapshot on a later failure, so failed stays false', async () => {
      const fetchMock = vi.fn().mockImplementation(ready)
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useTransitBoard('warszawa', ['1001']))
      await vi.waitFor(() => expect(result.current.data).not.toBeNull())

      fetchMock.mockRejectedValueOnce(new Error('network'))
      await vi.advanceTimersByTimeAsync(30000)
      await vi.waitFor(() => expect(result.current.error).toBe('network'))
      expect(result.current.failed).toBe(false)
      expect(result.current.data).not.toBeNull()
    })
  })
})
