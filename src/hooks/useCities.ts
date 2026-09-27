'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

export function useCities(): { state: CitiesState; cities: CityEntry[]; retry: () => void } {
  const [state, setState] = useState<CitiesState>(lastResult !== null ? 'ready' : 'loading')
  const [cities, setCities] = useState<CityEntry[]>(lastResult ?? [])
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    fetchCities()
      .then((result) => {
        if (cancelledRef.current) return
        setCities(result)
        setState('ready')
      })
      .catch(() => {
        if (!cancelledRef.current) setState('failed')
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  // Wywoływane z kliknięcia „Spróbuj ponownie", nie z efektu — setState('loading')
  // tu jest bezpieczny (react-hooks/set-state-in-effect pilnuje tylko efektów).
  const retry = useCallback(() => {
    setState('loading')
    fetchCities()
      .then((result) => {
        if (cancelledRef.current) return
        setCities(result)
        setState('ready')
      })
      .catch(() => {
        if (!cancelledRef.current) setState('failed')
      })
  }, [])

  return { state, cities, retry }
}

/** Tylko do testów — wyzerowanie modułowego cache'a między przypadkami. */
export function resetCitiesCacheForTests(): void {
  inFlight = null
  lastResult = null
}
