'use client'

import type { VehicleOnRoute } from '@/lib/gtfs/vehicleProject'
import { fetchJson, usePolling } from './usePolling'

export type LineVehiclesState = {
  vehicles: VehicleOnRoute[]
  feed: { state: string; ageMs: number | null }
  error: string | null
}

const REFRESH_MS = 20_000

type LineVehiclesResponse = { vehicles: VehicleOnRoute[]; feed: { state: string; ageMs: number | null } }

const LOADING_STATE: Omit<LineVehiclesState, 'error'> = { vehicles: [], feed: { state: 'loading', ageMs: null } }

/**
 * Poll pozycji pojazdów jednej linii i kierunku (`/api/gtfs/vehicles`) co 20 s
 * (pauza na ukrytej karcie w `usePolling`).
 * Payload niesie rzut GPS i opcjonalny stan względem rozkładu, bez minut opóźnienia.
 * Błąd ustawia `error`, ale zachowuje ostatnią listę `vehicles`. `directionId`
 * spoza {0,1} (nieznany kierunek przebiegu) = brak zapytania — endpoint i tak go
 * nie przyjmuje.
 */
export function useLineVehicles(city: string, routeId: string, directionId: number, tripId?: string, context?: { date: string; stop?: string; seq?: number }): LineVehiclesState {
  const key = directionId === 0 || directionId === 1 ? JSON.stringify(context === undefined ? tripId === undefined ? [city, routeId, directionId] : [city, routeId, directionId, tripId] : [city, routeId, directionId, tripId, context.date, context.stop, context.seq]) : null
  const contextParams = context === undefined ? '' : `&date=${encodeURIComponent(context.date)}${context.stop === undefined ? '' : `&stop=${encodeURIComponent(context.stop)}`}${context.seq === undefined ? '' : `&seq=${context.seq}`}`
  const { data, error } = usePolling<LineVehiclesResponse>(
    key,
    () => fetchJson(`/api/gtfs/vehicles?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId)}&direction=${directionId}${tripId === undefined ? '' : `&trip=${encodeURIComponent(tripId)}`}${contextParams}`),
    { refreshMs: REFRESH_MS }
  )
  if (data === null) return { ...LOADING_STATE, error }
  return { vehicles: data.vehicles, feed: data.feed, error }
}
