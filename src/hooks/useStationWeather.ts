'use client'

import { useEffect, useState } from 'react'

export type StationWeather = {
  current: {
    temperatureC: number
    apparentTemperatureC: number
    weatherCode: number
    windSpeedKmh: number
    windDirectionDeg: number
    humidityPercent: number
    pressureHpa: number
  }
  today: {
    minTemperatureC: number
    maxTemperatureC: number
    precipitationMm: number
    precipitationProbabilityPercent: number
    sunrise: string
    sunset: string
  }
  fetchedAt: string
}

export type UseStationWeatherResult =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; weather: StationWeather }

type WeatherApiResponse = { available: true; weather: StationWeather } | { available: false; reason: 'no-location' }

/**
 * Jeden fetch przy zamontowaniu / zmianie `stationId`, bez interwału --
 * decyzja świadoma: powtórne wejścia na tę samą stację w oknie TTL są tanie
 * dzięki cache'owi serwera (`/api/weather/route.ts`), więc nie ma sensu
 * dobijać go cyklicznie po stronie klienta (inaczej niż `useBoard.ts`, które
 * odświeża tablicę na żywo).
 */
export function useStationWeather(stationId: string): UseStationWeatherResult {
  const [result, setResult] = useState<UseStationWeatherResult>({ status: 'loading' })

  useEffect(() => {
    let ignore = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset na nową stację, ten sam wzorzec co useBoard.ts
    setResult({ status: 'loading' })

    fetch(`/api/weather?stationId=${stationId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json = (await response.json()) as WeatherApiResponse
        if (ignore) return
        setResult(json.available ? { status: 'ready', weather: json.weather } : { status: 'unavailable' })
      })
      .catch(() => {
        if (!ignore) setResult({ status: 'error' })
      })

    // Guard przed wyścigiem: spóźniona odpowiedź dla poprzedniej stacji nie
    // ma nadpisać stanu po zmianie `stationId` (ten sam idiom co `cancelled`
    // w useBoard.ts).
    return () => {
      ignore = true
    }
  }, [stationId])

  return result
}
