// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStationWeather } from './useStationWeather'
import { jsonResponse } from '@/test-utils/http'

const WEATHER = {
  current: {
    temperatureC: 21.7,
    apparentTemperatureC: 21.0,
    weatherCode: 2,
    windSpeedKmh: 10.4,
    windDirectionDeg: 225,
    humidityPercent: 56,
    pressureHpa: 1013.2,
  },
  today: {
    minTemperatureC: 12.9,
    maxTemperatureC: 25.6,
    precipitationMm: 2.3,
    precipitationProbabilityPercent: 2,
    sunrise: '2026-08-30T05:44',
    sunset: '2026-08-30T19:28',
  },
  fetchedAt: '2026-08-30T20:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useStationWeather', () => {
  it('starts loading, then resolves to ready with the weather payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ available: true, weather: WEATHER })))

    const { result } = renderHook(() => useStationWeather('33605'))

    expect(result.current).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toEqual({ status: 'ready', weather: WEATHER })
  })

  it('resolves to unavailable when the station has no location data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ available: false, reason: 'no-location' })))

    const { result } = renderHook(() => useStationWeather('999999'))

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
  })

  it('resolves to error on a failed fetch, distinct from unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }))
    )

    const { result } = renderHook(() => useStationWeather('33605'))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('ignores a late response for a station the user has already navigated away from', async () => {
    let resolveFirst!: (value: Response) => void
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstPending)
      .mockImplementationOnce(() => jsonResponse({ available: true, weather: WEATHER }))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ stationId }) => useStationWeather(stationId), {
      initialProps: { stationId: 'A' },
    })

    // Zmiana stacji zanim odpowiedź dla "A" zdążyła dotrzeć.
    rerender({ stationId: 'B' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toEqual({ status: 'ready', weather: WEATHER })

    // Spóźniona odpowiedź dla "A" nie ma prawa nadpisać stanu stacji "B".
    resolveFirst(await jsonResponse({ available: false, reason: 'no-location' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current).toEqual({ status: 'ready', weather: WEATHER })
  })
})
