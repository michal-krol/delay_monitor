// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLineLoading, useLineDetail } from './useLineDetail'
import type { AlertFeedStatus } from '@/lib/gtfs/alertView'
import { jsonResponse } from '@/test-utils/http'

const LINE = { routeId: '20', line: '20', longName: '', mode: 'tram', kind: 'regular', directions: [] }
const ALERT = { id: 'a1', title: 'Objazd', description: '', effect: 'DETOUR', routes: ['20'], activeFrom: null, activeTo: null, link: '' }
const READY = { line: LINE, schedule: { state: 'ready' } }
const feed = (state: AlertFeedStatus['state'], fetchedAt: string | null): AlertFeedStatus => ({ state, fetchedAt, ageMs: fetchedAt === null ? null : 1000 })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useLineDetail', () => {
  it('does nothing while no line is chosen', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', null))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ detail: undefined, alerts: [], error: false, alertsState: 'loading', alertsStale: false })
  })

  it('retries while the schedule loads, then returns the line; null for a line the schedule does not know', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ line: null, schedule: { state: 'loading' } }))
      .mockImplementationOnce(() => jsonResponse({ line: LINE, schedule: { state: 'ready' } }))
      .mockImplementation(() => jsonResponse({ line: null, schedule: { state: 'ready' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ id }) => useLineDetail('warszawa', id), { initialProps: { id: '20' as string | null } })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(result.current.detail).toBeUndefined()
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(result.current.detail).toEqual(LINE))
    expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/line?city=warszawa&route=20')

    rerender({ id: 'X9' })
    expect(result.current.detail).toBeUndefined()
    await vi.waitFor(() => expect(result.current.detail).toBeNull())
  })

  it('polls on the ladder while alerts are unknown (null) and exposes them once known', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ line: LINE, schedule: { state: 'ready' }, alerts: null }))
      .mockImplementation(() => jsonResponse({ line: LINE, schedule: { state: 'ready' }, alerts: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.detail).toEqual(LINE)) // przebieg już jest, alerty jeszcze nie
    expect(result.current.alerts).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // alerty znane -> koniec ponawiania
  })

  it('a failed schedule is not "loading": no retry ladder (same predicate as the line page)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ line: null, schedule: { state: 'failed' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual({ detail: undefined, alerts: [], error: true, alertsState: 'failed', alertsStale: false }) // błąd, nie wieczny szkielet
  })

  it('keeps the last good detail and alerts when a later fetch errors (AGENTS.md #7)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ line: LINE, schedule: { state: 'ready' }, alerts: null }))
      .mockImplementation(() => Promise.reject(new Error('net')))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.detail).toEqual(LINE))
    await vi.advanceTimersByTimeAsync(1_000) // krok drabinki (alerty nieznane) -> błąd sieci
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    // przebieg zostaje, nie znika w szkielet; alerty były nieznane (null) -> nie „nieaktualne"
    expect(result.current).toEqual({ detail: LINE, alerts: [], error: true, alertsState: 'failed', alertsStale: false })
  })

  it('failed alert feed with unknown alerts (null) does not run the ladder; retries once after 5 min', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ ...READY, alerts: null, alertFeed: feed('failed', null) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.alertsState).toBe('failed'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // zero drabinki 1/2/3/5/8/15 s
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('recovers failed -> ready when the feed answers on the 5 min retry', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ ...READY, alerts: [], alertFeed: feed('failed', null) }))
      .mockImplementation(() => jsonResponse({ ...READY, alerts: [], alertFeed: feed('ready', '2026-10-10T10:00:00Z') }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.alertsState).toBe('failed'))
    expect(result.current.alertsStale).toBe(false) // nigdy nie pobrano -> nie ma czego starzeć
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    await vi.waitFor(() => expect(result.current.alertsState).toBe('ready'))
    expect(result.current.alertsStale).toBe(false)
    expect(result.current.alerts).toEqual([])
  })

  it('failed feed with a last good fetch keeps the list and marks it stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...READY, alerts: [ALERT], alertFeed: feed('failed', '2026-10-10T09:00:00Z') })))
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.alertsState).toBe('failed'))
    expect(result.current.alertsStale).toBe(true)
    expect(result.current.alerts).toEqual([ALERT])
  })

  it('network error before any success: error, alertsState failed, not stale, no fake empty success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.reject(new Error('net'))))
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current).toEqual({ detail: undefined, alerts: [], error: true, alertsState: 'failed', alertsStale: false })
  })

  it('network error after a known alerts projection: alertsState failed + stale, detail and alerts preserved', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ ...READY, alerts: [ALERT], alertFeed: feed('failed', '2026-10-10T09:00:00Z') }))
      .mockImplementation(() => Promise.reject(new Error('net')))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.alertsState).toBe('failed'))
    await vi.advanceTimersByTimeAsync(5 * 60_000) // ponowienie po nieudanym feedzie -> błąd sieci
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current).toEqual({ detail: LINE, alerts: [ALERT], error: true, alertsState: 'failed', alertsStale: true })
  })

  it('schedule loading is alertsState loading even though alerts is [] (it means nothing about the line)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ line: null, schedule: { state: 'loading' }, alerts: [], alertFeed: feed('ready', '2026-10-10T10:00:00Z') }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(result.current.alertsState).toBe('loading')
    expect(result.current.alertsStale).toBe(false)
  })

  it('schedule failed is alertsState failed, not stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ line: null, schedule: { state: 'failed' }, alerts: [], alertFeed: null })))
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.alertsState).toBe('failed')
    expect(result.current.alertsStale).toBe(false)
  })

  it('ready feed + [] is the only "none": alertsState ready, not stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...READY, alerts: [], alertFeed: feed('ready', '2026-10-10T10:00:00Z') })))
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.alertsState).toBe('ready'))
    expect(result.current.alertsStale).toBe(false)
    expect(result.current.alerts).toEqual([])
  })

  it('an old payload without alerts and alertFeed keeps the previous behaviour: ready, []', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(READY)))
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.detail).toEqual(LINE))
    expect(result.current.alertsState).toBe('ready')
    expect(result.current.alerts).toEqual([])
  })

  it('flags an error and retries after 30 s', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('net')))
      .mockImplementation(() => jsonResponse({ line: LINE, schedule: { state: 'ready' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.waitFor(() => expect(result.current.detail).toEqual(LINE))
  })
})

describe('isLineLoading', () => {
  const base = { line: LINE as never, schedule: { state: 'ready' } }
  it('alerts null + feed not failed = still loading', () => {
    expect(isLineLoading({ ...base, alerts: null })).toBe(true)
    expect(isLineLoading({ ...base, alerts: null, alertFeed: feed('loading', null) })).toBe(true)
  })
  it('alerts null + failed feed ends the fast ladder', () => {
    expect(isLineLoading({ ...base, alerts: null, alertFeed: feed('failed', null) })).toBe(false)
  })
  it('schedule loading is loading regardless of the feed', () => {
    expect(isLineLoading({ line: null, schedule: { state: 'loading' }, alerts: [], alertFeed: feed('failed', null) })).toBe(true)
  })
})
