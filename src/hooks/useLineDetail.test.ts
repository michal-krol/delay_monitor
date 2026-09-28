// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLineDetail } from './useLineDetail'
import { jsonResponse } from '@/test-utils/http'

const LINE = { routeId: '20', line: '20', longName: '', color: null, textColor: '#ffffff', mode: 'tram', kind: 'regular', directions: [] }

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
    expect(result.current).toEqual({ detail: undefined, alerts: [], error: false })
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

  it('a failed schedule is not "loading": no retry ladder (same predicate as the line page)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ line: null, schedule: { state: 'failed' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLineDetail('warszawa', '20'))
    await vi.waitFor(() => expect(result.current.error).toBe(true))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual({ detail: undefined, alerts: [], error: true }) // błąd, nie wieczny szkielet
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
