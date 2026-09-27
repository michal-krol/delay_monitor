// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CityWeatherCard } from './CityWeatherCard'
import { jsonResponse } from '@/test-utils/http'

afterEach(() => vi.unstubAllGlobals())

describe('CityWeatherCard', () => {
  // weather: no station → no-location state -- dwie przyczyny tego samego
  // widocznego stanu (AGENTS.md #7, ale brief każe traktować obie jako
  // „brak lokalizacji", nie osobny błąd sieciowy): (1) /api/cities zawiodło,
  // (2) miasto nie ma stacji kolejowej. Bez tej naprawy `useStationWeather('')`
  // zostawałby w `loading` na zawsze -- karta kręciłaby spinner w nieskończoność.
  it('/api/cities zawiodło → karta pogody pokazuje stan „brak lokalizacji", nie kręci się w nieskończoność', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    render(<CityWeatherCard city="warszawa" />)
    expect(await screen.findByText('Brak danych lokalizacyjnych dla tej stacji.')).toBeInTheDocument()
  })

  it('miasto bez stacji kolejowej → karta pogody pokazuje stan „brak lokalizacji"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] }))
    )
    render(<CityWeatherCard city="warszawa" />)
    expect(await screen.findByText('Brak danych lokalizacyjnych dla tej stacji.')).toBeInTheDocument()
  })

  it('miasto ze stacją kolejową → wywołuje pogodę dla pierwszej stacji (nie „brak lokalizacji")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/cities')
          ? jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [{ id: '33605', name: 'Warszawa Centralna' }] }] })
          : jsonResponse({ available: false, reason: 'no-location' })
      )
    )
    render(<CityWeatherCard city="warszawa" />)
    expect(await screen.findByText('Brak danych lokalizacyjnych dla tej stacji.')).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('stationId=33605'))
  })
})
