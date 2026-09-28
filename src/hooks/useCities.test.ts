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

  it('malformed elements are dropped, valid ones kept', async () => {
    const malformed = [
      null,
      'warszawa',
      { id: 'x' },
      { id: 1, name: 'Bad id', railStations: [] },
      { id: 'krakow', name: 'Kraków', railStations: 'none' },
      { id: 'gdansk', name: 'Gdańsk', railStations: [{ id: 5, name: 'Gdańsk Główny' }] },
      { id: 'lodz', name: 'Łódź', railStations: [], railStationsUnknown: 'yes' },
    ]
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [malformed[0], CITY, ...malformed.slice(1)] })))

    const { result } = renderHook(() => useCities())

    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.cities).toEqual([CITY])
  })

  it('extra response fields are not required and do not break the entry', async () => {
    const withExtras = { ...CITY, timezone: 'Europe/Warsaw', mapCenter: { lat: 52, lon: 21 } }
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [withExtras] })))

    const { result } = renderHook(() => useCities())

    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.cities).toEqual([CITY]) // dodatkowe pola (timezone, mapCenter) odcięte
  })

  it.each([
    ['null body', null],
    ['array body', [CITY]],
    ['string body', 'cities'],
    ['object without cities', {}],
  ])('%s → failed', async (_name, body) => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(body)))

    const { result } = renderHook(() => useCities())

    await vi.waitFor(() => expect(result.current.state).toBe('failed'))
    expect(result.current.cities).toEqual([])
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

  it('result with railStationsUnknown is refetched on next mount', async () => {
    // Server-side negative cache for rail stations (railStations.ts) expires
    // after 10 min; caching this result for the whole browser session would
    // keep showing "—"/no weather until a full reload (AGENTS.md #7).
    const unknownCity = { id: 'warszawa', name: 'Warszawa', railStations: [], railStationsUnknown: true }
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ cities: [unknownCity] }))
      .mockImplementationOnce(() => jsonResponse({ cities: [CITY] }))
    vi.stubGlobal('fetch', fetchMock)

    const { result: first, unmount } = renderHook(() => useCities())
    await vi.waitFor(() => expect(first.current.state).toBe('ready'))
    expect(first.current.cities).toEqual([unknownCity])
    unmount()

    const { result: second } = renderHook(() => useCities())
    await vi.waitFor(() => expect(second.current.state).toBe('ready'))
    expect(second.current.cities).toEqual([CITY])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retry() refetches after failure without remounting', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('network down')))
      .mockImplementationOnce(() => jsonResponse({ cities: [CITY] }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCities())
    await vi.waitFor(() => expect(result.current.state).toBe('failed'))

    result.current.retry()

    await vi.waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.cities).toEqual([CITY])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
