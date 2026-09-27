'use client'

import { useCities } from '@/hooks/useCities'
import { useStationWeather, type UseStationWeatherResult } from '@/hooks/useStationWeather'
import { AsideCard } from './aside'
import { WeatherCard } from './StationAside'

/**
 * Widżet pogody w kontekście miasta — na KAŻDYM ekranie komunikacji miejskiej.
 * ponytail: pogoda miasta ≈ pogoda jego głównej stacji kolejowej (`/api/weather`
 * jest kluczowane po stacji PKP). Gdyby to było za grube przybliżenie —
 * `/api/weather` po lat/lon przystanku, osobny temat.
 */
export function CityWeatherCard({ city }: { city: string }) {
  const { state: citiesState, cities } = useCities()
  const entry = cities.find((option) => option.id === city) ?? null

  const stationId = entry?.railStations?.[0]?.id ?? ''
  const fetchedWeather = useStationWeather(stationId)
  // /api/cities zawiodło, albo miasto nie ma (jeszcze) żadnej stacji kolejowej
  // -- w obu przypadkach zamiast wołać `useStationWeather('')` (zostawałoby
  // w `loading` na zawsze, bo hook nie odpytuje przy pustym `stationId`),
  // pokazujemy istniejący stan „brak lokalizacji" karty pogody.
  const noLocation = citiesState === 'failed' || (citiesState === 'ready' && stationId === '')
  const weather: UseStationWeatherResult = noLocation ? { status: 'unavailable' } : fetchedWeather

  return (
    <AsideCard title={`Pogoda dziś — ${entry?.name ?? city}`}>
      <WeatherCard weather={weather} />
    </AsideCard>
  )
}
