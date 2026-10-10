// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPollingCache } from './pollingCache'
import { useCityLines } from './useCityLines'
import { jsonResponse } from '@/test-utils/http'
import type { LineListEntry } from '@/lib/gtfs/query'

const entry = (routeId: string, mode: LineListEntry['mode']): LineListEntry => ({ routeId, line: routeId, longName: '', mode, kind: 'regular' })
const M1 = entry('M1', 'metro')
const T20 = entry('20', 'tram')
const B128 = entry('128', 'bus')
const B190 = entry('190', 'bus')
const S2 = entry('S2', 'rail')

const SCHEDULE_READY = { state: 'ready', loadedAt: null, ageMs: 0, phase: null, serviceDates: null, feedVersion: null }
const response = (city: string, lines: Record<string, LineListEntry[]> | null, state = 'ready') =>
  jsonResponse({ city, schedule: { ...SCHEDULE_READY, state }, lines, attribution: ['ZTM'] })
const ALL = { metro: [M1], tram: [T20], bus: [B128, B190], rail: [S2], other: [] }

beforeEach(() => {
  vi.useFakeTimers()
  clearPollingCache()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCityLines', () => {
  it('city null → no fetch, ready, lines null', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(() => useCityLines(null))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ lines: null, state: 'ready', error: false, refresh: expect.any(Function), schedule: null, attribution: [] })
    const first = result.current.refresh
    rerender()
    expect(result.current.refresh).toBe(first)
  })

  it('flattens grouped lines in MODE_ORDER', async () => {
    const fetchMock = vi.fn().mockImplementation(() => response('warszawa', ALL))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityLines('warszawa'))
    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/lines?city=warszawa')
    expect(result.current.lines).toEqual([M1, T20, B128, B190, S2])
    expect(result.current.schedule?.state).toBe('ready')
    expect(result.current.attribution).toEqual(['ZTM'])
    expect(result.current.error).toBe(false)
  })

  it('[] only after a successful empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => response('warszawa', { metro: [], tram: [], bus: [], rail: [], other: [] })))
    const { result } = renderHook(() => useCityLines('warszawa'))
    expect(result.current.lines).toBeNull() // before any response: unknown, not []
    expect(result.current.state).toBe('loading')
    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.lines).toEqual([])
  })

  it('lines null and loading while schedule loads (ladder retries)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => response('warszawa', null, 'loading'))
      .mockImplementation(() => response('warszawa', ALL))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityLines('warszawa'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(result.current.schedule?.state).toBe('loading'))
    expect(result.current.lines).toBeNull()
    expect(result.current.state).toBe('loading')
    expect(result.current.error).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.lines).toHaveLength(5)
  })

  it('schedule failed → failed, not infinite loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => response('warszawa', null, 'failed')))
    const { result } = renderHook(() => useCityLines('warszawa'))
    await vi.waitFor(() => expect(result.current.state).toBe('failed'))
    expect(result.current.lines).toBeNull()
    expect(result.current.error).toBe(true)
  })

  it('fetch error before any data → failed with error true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.reject(new Error('net'))))
    const { result } = renderHook(() => useCityLines('warszawa'))
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.state).toBe('failed')
    expect(result.current.lines).toBeNull()
  })

  it("city A→B ignores late response of A and never shows A's lines under B", async () => {
    let resolveA: (r: Response) => void = () => {}
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes('city=a')
        ? new Promise<Response>((resolve) => (resolveA = resolve))
        : response('b', { metro: [], tram: [T20], bus: [], rail: [], other: [] })
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ city }) => useCityLines(city), { initialProps: { city: 'a' as string | null } })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender({ city: 'b' })
    expect(result.current.lines).toBeNull() // A's data never appears under B
    await vi.waitFor(() => expect(result.current.lines).toEqual([T20]))
    await act(async () => {
      resolveA(await new Response(JSON.stringify({ city: 'a', schedule: SCHEDULE_READY, lines: ALL, attribution: [] })))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.lines).toEqual([T20]) // late A response ignored
  })

  it('same city keeps last data through a refresh error', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => response('warszawa', ALL))
      .mockImplementation(() => Promise.reject(new Error('net')))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityLines('warszawa'))
    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    act(() => result.current.refresh())
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.state).toBe('ready')
    expect(result.current.lines).toHaveLength(5)
  })

  it('refresh refetches', async () => {
    const fetchMock = vi.fn().mockImplementation(() => response('warszawa', ALL))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCityLines('warszawa'))
    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => result.current.refresh())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
