// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCitiesCacheForTests, useCities } from './useCities'
import { jsonResponse } from '@/test-utils/http'

const CITY = { id: 'warszawa', name: 'Warszawa', railStations: [{ id: '33605', name: 'Warszawa Centralna' }] }

beforeEach(() => resetCitiesCacheForTests())
afterEach(() => vi.unstubAllGlobals())

describe('useCities', () => {
  it('failed fetch → failed state', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))

    const { result } = renderHook(() => useCities())

    expect(result.current.state).toBe('loading')
    await vi.waitFor(() => expect(result.current.state).toBe('failed'))
    expect(result.current.cities).toEqual([])
  })

  it('non-array cities → failed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ snapshots: [] })))

    const { result } = renderHook(() => useCities())

    await vi.waitFor(() => expect(result.current.state).toBe('failed'))
  })

  it('two components share one request', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ cities: [CITY] }))
    vi.stubGlobal('fetch', fetchMock)

    const { result: first } = renderHook(() => useCities())
    const { result: second } = renderHook(() => useCities())

    await vi.waitFor(() => expect(first.current.state).toBe('ready'))
    expect(second.current.state).toBe('ready')
    expect(second.current.cities).toEqual([CITY])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('failed result is retried on next mount', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('network down')))
      .mockImplementationOnce(() => jsonResponse({ cities: [CITY] }))
    vi.stubGlobal('fetch', fetchMock)

    const { result: first, unmount } = renderHook(() => useCities())
    await vi.waitFor(() => expect(first.current.state).toBe('failed'))
    unmount()

    const { result: second } = renderHook(() => useCities())
    await vi.waitFor(() => expect(second.current.state).toBe('ready'))
    expect(second.current.cities).toEqual([CITY])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
