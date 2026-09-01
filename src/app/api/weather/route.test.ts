import { describe, expect, it, vi } from 'vitest'
import { WeatherApiError } from '@/lib/weather/client'

const getStationCoordinates = vi.fn()
const fetchOpenMeteoWeather = vi.fn()

vi.mock('@/lib/weather/coordinates', () => ({
  getStationCoordinates: (...args: [string]) => getStationCoordinates(...args),
}))
vi.mock('@/lib/weather/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/weather/client')>()
  return { ...actual, fetchOpenMeteoWeather: (...args: [number, number]) => fetchOpenMeteoWeather(...args) }
})

const SNAPSHOT = {
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
}

describe('GET /api/weather', () => {
  it('returns 400 when stationId is missing', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/weather'))
    expect(response.status).toBe(400)
    expect(getStationCoordinates).not.toHaveBeenCalled()
  })

  it('rejects a malformed stationId without echoing the input', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/weather?stationId=1%3B DROP'))
    const body = await response.json()
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('DROP')
    expect(getStationCoordinates).not.toHaveBeenCalled()
  })

  it('returns available:false with reason no-location when the station has no coordinates', async () => {
    getStationCoordinates.mockResolvedValueOnce(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/weather?stationId=111111'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ available: false, reason: 'no-location' })
    expect(fetchOpenMeteoWeather).not.toHaveBeenCalled()
  })

  it('returns available:true with the weather snapshot on success', async () => {
    getStationCoordinates.mockResolvedValueOnce({ lat: 52.2288207, lon: 21.00316 })
    fetchOpenMeteoWeather.mockResolvedValueOnce(SNAPSHOT)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/weather?stationId=222222'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.available).toBe(true)
    expect(body.weather).toMatchObject(SNAPSHOT)
    expect(typeof body.weather.fetchedAt).toBe('string')
  })

  it('maps a 5xx WeatherApiError to 502', async () => {
    getStationCoordinates.mockResolvedValueOnce({ lat: 52, lon: 21 })
    fetchOpenMeteoWeather.mockRejectedValueOnce(new WeatherApiError('boom', 503))
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/weather?stationId=333333'))
    expect(response.status).toBe(502)
  })

  it('passes through a non-5xx WeatherApiError status', async () => {
    getStationCoordinates.mockResolvedValueOnce({ lat: 52, lon: 21 })
    fetchOpenMeteoWeather.mockRejectedValueOnce(new WeatherApiError('bad request', 400))
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/weather?stationId=444444'))
    expect(response.status).toBe(400)
  })

  it('returns 500 on an unexpected error, without leaking it to the client', async () => {
    getStationCoordinates.mockResolvedValueOnce({ lat: 52, lon: 21 })
    fetchOpenMeteoWeather.mockRejectedValueOnce(new Error('boom'))
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/weather?stationId=555555'))
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.error).toBe('Nieoczekiwany błąd')
  })

  // AGENTS.md #7: awaria wczytania pliku współrzędnych ma dać błąd (UI: „Nie
  // udało się pobrać pogody"), a nie `available:false` („Brak danych
  // lokalizacyjnych dla tej stacji") -- i nie ma osiąść w cache'u, bo to stan
  // przejściowy, w przeciwieństwie do prawdziwego braku współrzędnych.
  it('returns 500 and does not cache when the coordinates file fails to load', async () => {
    getStationCoordinates.mockClear()
    getStationCoordinates.mockRejectedValueOnce(new Error('ENOENT'))
    const { GET } = await import('./route')

    const first = await GET(new Request('http://localhost/api/weather?stationId=777777'))
    const body = await first.json()
    expect(first.status).toBe(500)
    expect(body).not.toMatchObject({ available: false })

    getStationCoordinates.mockResolvedValueOnce(null)
    const second = await GET(new Request('http://localhost/api/weather?stationId=777777'))
    expect(second.status).toBe(200)
    expect(getStationCoordinates).toHaveBeenCalledTimes(2)
  })

  it('caches a successful response and dedupes the upstream call on a second request', async () => {
    // Liczniki wywołań mocków kumulują się przez cały plik (żadnego auto-resetu
    // w konfiguracji vitest) -- czyścimy jawnie, żeby ta asercja liczyła tylko
    // wywołania z tego testu.
    getStationCoordinates.mockClear()
    fetchOpenMeteoWeather.mockClear()
    getStationCoordinates.mockResolvedValueOnce({ lat: 52, lon: 21 })
    fetchOpenMeteoWeather.mockResolvedValueOnce(SNAPSHOT)
    const { GET } = await import('./route')

    const first = await GET(new Request('http://localhost/api/weather?stationId=666666'))
    expect(first.status).toBe(200)

    const second = await GET(new Request('http://localhost/api/weather?stationId=666666'))
    expect(second.status).toBe(200)

    expect(fetchOpenMeteoWeather).toHaveBeenCalledTimes(1)
    expect(getStationCoordinates).toHaveBeenCalledTimes(1)
  })
})
