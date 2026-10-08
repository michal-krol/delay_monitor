'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { z } from 'zod'

/** Odpowiedź serwera to dane spoza aplikacji — schemat, nie asercja typu (AGENTS.md #4). Dodatkowe pola są odrzucane. */
const cityEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  railStations: z.array(z.object({ id: z.string(), name: z.string() })),
  railStationsUnknown: z.boolean().optional(),
})

export type CityEntry = z.infer<typeof cityEntrySchema>

type CitiesState = 'loading' | 'failed' | 'ready'

/**
 * Ciało bez tablicy `cities` = błąd (`null`); pojedynczy zły element jest
 * pomijany, poprawne zostają — jedno uszkodzone miasto nie ma zerować pickera.
 */
function parseCities(body: unknown): CityEntry[] | null {
  if (typeof body !== 'object' || body === null) return null
  const { cities } = body as { cities?: unknown }
  if (!Array.isArray(cities)) return null
  return cities.flatMap((element) => {
    const parsed = cityEntrySchema.safeParse(element)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * `/api/cities` odpytywane raz na całą stronę, nie raz na komponent —
 * `WeatherChip`, `TransitStopDetail`, `TransitStopCard` i strona miasta
 * (Task 9) renderują się razem, więc bez tej pary modułowych zmiennych każdy
 * z nich robiłby własny fetch tego samego, niezmiennego w ramach wizyty
 * rejestru miast. Zerowane na porażkę (nie zapamiętujemy błędu), żeby kolejny
 * mount spróbował od nowa — zgodnie z `useNetworkStats.ts`.
 *
 * ponytail: cache trwa całą sesję przeglądarki (aż do przeładowania strony),
 * bo rejestr miast się nie zmienia bez wdrożenia. Jeśli kiedyś będzie się
 * zmieniał bez wdrożenia — dodać TTL.
 */
let inFlight: Promise<CityEntry[]> | null = null
let lastResult: CityEntry[] | null = null

/**
 * `lastResult`, ale `null` gdy zawiera `railStationsUnknown` — negatywny
 * cache po stronie serwera (`railStations.ts`) wygasa po 10 min; trzymanie
 * takiego wyniku przez całą sesję pokazywałoby „—"/brak pogody aż do
 * przeładowania strony (AGENTS.md #7). Jedno miejsce, bo o `lastResult`
 * pyta i `fetchCities()`, i stan początkowy `useCities()`.
 */
function usableCachedResult(): CityEntry[] | null {
  if (lastResult === null || lastResult.some((city) => city.railStationsUnknown === true)) return null
  return lastResult
}

function fetchCities(): Promise<CityEntry[]> {
  const cached = usableCachedResult()
  if (cached !== null) return Promise.resolve(cached)
  if (inFlight !== null) return inFlight
  inFlight = fetch('/api/cities')
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((body: unknown) => {
      const cities = parseCities(body)
      if (cities === null) throw new Error('Nieoczekiwany kształt odpowiedzi')
      lastResult = cities
      return cities
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function useCities(): { state: CitiesState; cities: CityEntry[]; retry: () => void } {
  const [state, setState] = useState<CitiesState>(usableCachedResult() !== null ? 'ready' : 'loading')
  const [cities, setCities] = useState<CityEntry[]>(usableCachedResult() ?? [])
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
