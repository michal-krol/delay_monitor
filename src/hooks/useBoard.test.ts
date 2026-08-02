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
})
