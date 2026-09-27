'use client'

import { useEffect, useState } from 'react'

export type CityEntry = {
  id: string
  name: string
  railStations: { id: string; name: string }[]
  railStationsUnknown?: boolean
}

type CitiesState = 'loading' | 'failed' | 'ready'

function isCitiesBody(value: unknown): value is { cities: CityEntry[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { cities?: unknown }).cities)
}

/**
 * `/api/cities` odpytywane raz na całą stronę, nie raz na komponent —
 * `CityWeatherCard`, `TransitStopDetail`, `TransitStopCard` i strona miasta
 * (Task 9) renderują się razem, więc bez tej pary modułowych zmiennych każdy
 * z nich robiłby własny fetch tego samego, niezmiennego w ramach wizyty
 * rejestru miast. Zerowane na porażkę (nie zapamiętujemy błędu), żeby kolejny
 * mount spróbował od nowa — zgodnie z `useNetworkStats.ts`.
 */
let inFlight: Promise<CityEntry[]> | null = null
let lastResult: CityEntry[] | null = null

function fetchCities(): Promise<CityEntry[]> {
  if (lastResult !== null) return Promise.resolve(lastResult)
  if (inFlight !== null) return inFlight
  inFlight = fetch('/api/cities')
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((body: unknown) => {
      if (!isCitiesBody(body)) throw new Error('Nieoczekiwany kształt odpowiedzi')
      lastResult = body.cities
      return body.cities
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function useCities(): { state: CitiesState; cities: CityEntry[] } {
  const [state, setState] = useState<CitiesState>(lastResult !== null ? 'ready' : 'loading')
  const [cities, setCities] = useState<CityEntry[]>(lastResult ?? [])

  useEffect(() => {
    let cancelled = false
    fetchCities()
      .then((result) => {
        if (cancelled) return
        setCities(result)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { state, cities }
}

/** Tylko do testów — wyzerowanie modułowego cache'a między przypadkami. */
export function resetCitiesCacheForTests(): void {
  inFlight = null
  lastResult = null
}
