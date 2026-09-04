'use client'

import { useEffect, useState } from 'react'
import { useStationWeather } from '@/hooks/useStationWeather'
import { AsideCard } from './aside'
import { WeatherCard } from './StationAside'

type CityEntry = { id: string; name: string; railStations: { id: string; name: string }[] }

/**
 * Widżet pogody w kontekście miasta — na KAŻDYM ekranie komunikacji miejskiej.
 * ponytail: pogoda miasta ≈ pogoda jego głównej stacji kolejowej (`/api/weather`
 * jest kluczowane po stacji PKP). Gdyby to było za grube przybliżenie —
 * `/api/weather` po lat/lon przystanku, osobny temat.
 */
export function CityWeatherCard({ city }: { city: string }) {
  const [entry, setEntry] = useState<CityEntry | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityEntry[] }) => {
        if (!cancelled) setEntry(body.cities.find((option) => option.id === city) ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [city])

  const weather = useStationWeather(entry?.railStations?.[0]?.id ?? '')

  return (
    <AsideCard title={`Pogoda dziś — ${entry?.name ?? city}`}>
      <WeatherCard weather={weather} />
    </AsideCard>
  )
}
