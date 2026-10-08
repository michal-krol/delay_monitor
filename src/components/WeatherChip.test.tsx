// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeatherChip } from './WeatherChip'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'

beforeEach(() => resetCitiesCacheForTests())
afterEach(() => vi.unstubAllGlobals())

const WARSAW = { id: 'warszawa', name: 'Warszawa', railStations: [{ id: '33605', name: 'Warszawa Centralna' }] }
const WEATHER = {
  available: true,
  location: { lat: 52.2, lon: 21 },
  weather: {
    current: { temperatureC: 17.6, apparentTemperatureC: 16, weatherCode: 0, windSpeedKmh: 10, windDirectionDeg: 90, humidityPercent: 50, pressureHpa: 1013 },
    today: { minTemperatureC: 9, maxTemperatureC: 19, precipitationMm: 0, precipitationProbabilityPercent: 5, sunrise: '2026-10-07T06:30', sunset: '2026-10-07T17:30' },
    fetchedAt: '2026-10-07T10:00:00Z',
  },
}

describe('WeatherChip', () => {
  it('wczytywanie → sama ikona, bez temperatury (nie „0°”, #7)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<WeatherChip city="warszawa" />)
    const chip = screen.getByRole('button', { name: 'Pogoda: wczytywanie…' })
    expect(chip).not.toHaveTextContent(/\d/)
  })

  it('pogoda gotowa → temperatura w chipie, nazwa z opisem, dotknięcie otwiera szczegóły', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/cities') ? jsonResponse({ cities: [WARSAW] }) : jsonResponse(WEATHER))))
    render(<WeatherChip city="warszawa" />)
    const chip = await screen.findByRole('button', { name: 'Pogoda: 18°C, Bezchmurnie' })
    expect(chip).toHaveTextContent('18°')
    fireEvent.click(chip)
    expect(screen.getByRole('region', { name: 'Pogoda dziś — Warszawa' })).toBeInTheDocument()
    expect(chip).toHaveAttribute('aria-expanded', 'true')
  })

  it('pogoda nie pobrana → bez temperatury, szczegóły mówią „Nie udało się pobrać pogody.”', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/cities') ? jsonResponse({ cities: [WARSAW] }) : Promise.reject(new Error('down')))))
    render(<WeatherChip city="warszawa" />)
    const chip = await screen.findByRole('button', { name: 'Pogoda: nie udało się pobrać' })
    expect(chip).not.toHaveTextContent(/\d/)
    fireEvent.click(chip)
    expect(screen.getByText('Nie udało się pobrać pogody.')).toBeInTheDocument()
  })

  // /api/cities zawiodło albo miasto bez stacji kolejowej → `useStationWeather('')` kręciłby się w nieskończoność.
  it('/api/cities zawiodło → „brak danych lokalizacyjnych”, nie wieczne wczytywanie', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    render(<WeatherChip city="warszawa" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pogoda: brak danych lokalizacyjnych' }))
    expect(screen.getByText('Brak danych lokalizacyjnych dla tej stacji.')).toBeInTheDocument()
  })

  it('miasto bez stacji kolejowej → „brak danych lokalizacyjnych” (bez zapytania o pogodę)', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] }))
    vi.stubGlobal('fetch', fetchMock)
    render(<WeatherChip city="warszawa" />)
    await screen.findByRole('button', { name: 'Pogoda: brak danych lokalizacyjnych' })
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/weather'))
  })
})
