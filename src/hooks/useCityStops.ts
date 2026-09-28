'use client'

import type { CityStop } from '@/lib/gtfs/query'
import { fetchJson, usePolling } from './usePolling'

/**
 * Przystanki miasta do warstwy przystanków (`/api/gtfs/stops`). Jedno pobranie;
 * `stops: null` w odpowiedzi = rozkład jeszcze się wczytuje → ponawiamy drabinką
 * `usePolling`. Trzy stany (#7): `null` + `error: false` = wczytuje się,
 * `error: true` = nie udało się (ponawiamy co 30 s), lista = dane.
 */
export function useCityStops(city: string): { stops: CityStop[] | null; error: boolean } {
  const { data, error } = usePolling<{ stops: CityStop[] | null }>(city, () => fetchJson(`/api/gtfs/stops?city=${encodeURIComponent(city)}`), {
    refreshMs: null,
    isLoading: (json) => json.stops === null,
  })
  return { stops: data?.stops ?? null, error: error !== null }
}
