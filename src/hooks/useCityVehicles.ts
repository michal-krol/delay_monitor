'use client'

import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import { fetchJson, usePolling } from './usePolling'

export type CityVehiclesState = {
  vehicles: CityVehicle[]
  feed: { state: string; ageMs: number | null }
  /** Numery linii z aktywnym alertem (pole pomocnicze — `[]` = brak znaczka). */
  alertLines: string[]
  error: string | null
}

const REFRESH_MS = 15_000

type CityVehiclesResponse = { vehicles: CityVehicle[]; feed: { state: string; ageMs: number | null }; alertLines?: string[] }

const LOADING_STATE: Omit<CityVehiclesState, 'error'> = { vehicles: [], feed: { state: 'loading', ageMs: null }, alertLines: [] }

/**
 * Poll WSZYSTKICH pozycji pojazdów miasta (`/api/gtfs/city-vehicles`) co 15 s —
 * mapa miasta live (pauza na ukrytej karcie w `usePolling`). Błąd ustawia
 * `error`, ale zachowuje ostatnią listę `vehicles` (AGENTS #7 — nie czyścić mapy
 * przy chwilowej awarii).
 */
export function useCityVehicles(city: string): CityVehiclesState {
  const { data, error } = usePolling<CityVehiclesResponse>(city, () => fetchJson(`/api/gtfs/city-vehicles?city=${encodeURIComponent(city)}`), {
    refreshMs: REFRESH_MS,
  })
  if (data === null) return { ...LOADING_STATE, error }
  return { vehicles: data.vehicles, feed: data.feed, alertLines: data.alertLines ?? [], error }
}
