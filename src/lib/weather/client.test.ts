import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenMeteoWeather, WeatherApiError } from './client'
import { jsonResponse } from '@/test-utils/http'

const VALID_BODY = {
  current: {
    temperature_2m: 21.7,
    apparent_temperature: 21.0,
    weather_code: 2,
    wind_speed_10m: 10.4,
    wind_direction_10m: 225,
    relative_humidity_2m: 56,
    surface_pressure: 1013.2,
  },
  daily: {
    temperature_2m_max: [25.6],
    temperature_2m_min: [12.9],
    precipitation_sum: [2.3],
    precipitation_probability_max: [2],
    sunrise: ['2026-08-30T05:44'],
    sunset: ['2026-08-30T19:28'],
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchOpenMeteoWeather', () => {
  it('requests the given coordinates with the expected parameters', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(VALID_BODY))
    vi.stubGlobal('fetch', fetchMock)

    await fetchOpenMeteoWeather(52.2288207, 21.00316)

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(requestedUrl.searchParams.get('latitude')).toBe('52.2288207')
    expect(requestedUrl.searchParams.get('longitude')).toBe('21.00316')
    expect(requestedUrl.searchParams.get('timezone')).toBe('Europe/Warsaw')
    expect(requestedUrl.searchParams.get('current')).toContain('temperature_2m')
    expect(requestedUrl.searchParams.get('daily')).toContain('sunrise')
  })

  it('maps a realistic Open-Meteo response to OpenMeteoSnapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(VALID_BODY)))

    const snapshot = await fetchOpenMeteoWeather(52.2288207, 21.00316)

    expect(snapshot).toEqual({
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
    })
  })

  it('throws WeatherApiError with the upstream status on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))

    await expect(fetchOpenMeteoWeather(52, 21)).rejects.toMatchObject({ name: 'WeatherApiError', status: 503 })
  })

  it('throws WeatherApiError(502) when the response body does not match the expected shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ unexpected: true })))

    await expect(fetchOpenMeteoWeather(52, 21)).rejects.toMatchObject({ name: 'WeatherApiError', status: 502 })
  })
})

describe('WeatherApiError', () => {
  it('is a real Error subclass carrying the status', () => {
    const err = new WeatherApiError('boom', 502)
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(502)
    expect(err.message).toBe('boom')
  })
})
