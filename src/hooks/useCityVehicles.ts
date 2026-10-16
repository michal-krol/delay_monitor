'use client'

import { useMemo } from 'react'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import { effectiveAgeMs } from '@/lib/format'
import { useNow } from './useNow'
import { fetchJson, usePolling } from './usePolling'

export type CityVehiclesState = {
  vehicles: CityVehicle[]
  feed: { state: string; ageMs: number | null }
  /** Numery linii z aktywnym alertem (pole pomocnicze — `[]` = brak znaczka). */
  alertLines: string[]
  error: string | null
  /** Kiedy (ms epoch, zegar klienta) przyszedł ostatni udany odczyt; `null` = jeszcze żaden. */
  lastSuccessAt: number | null
}

const REFRESH_MS = 15_000
/** Jak często dolicza się czas od odczytu do wieku pozycji (jeden zegar na stronę, nie na pojazd). */
const AGE_TICK_MS = 10_000

type CityVehiclesResponse = { vehicles: CityVehicle[]; feed: { state: string; ageMs: number | null }; alertLines?: string[] }

const NO_VEHICLES: CityVehicle[] = []
const NO_ALERT_LINES: string[] = []
const LOADING_STATE: Omit<CityVehiclesState, 'error' | 'lastSuccessAt'> = { vehicles: NO_VEHICLES, feed: { state: 'loading', ageMs: null }, alertLines: NO_ALERT_LINES }

/**
 * Poll WSZYSTKICH pozycji pojazdów miasta (`/api/gtfs/city-vehicles`) co 15 s —
 * mapa miasta live (pauza na ukrytej karcie w `usePolling`). Błąd ustawia
 * `error`, ale zachowuje ostatnią listę `vehicles` (AGENTS #7 — nie czyścić mapy
 * przy chwilowej awarii).
 *
 * `ageSec` pojazdów i `feed.ageMs` są już „teraz": wiek z odpowiedzi jest zamrożony w chwili jej
 * powstania, więc dokładamy czas od ostatniego udanego odczytu (`effectiveAgeMs`). Dzięki temu po
 * nieudanym odświeżeniu wiek rośnie, a pojazd w końcu przekracza progi wygaszania/ukrycia (`mapData`).
 */
export function useCityVehicles(city: string): CityVehiclesState {
  const { data, error, lastSuccessAt } = usePolling<CityVehiclesResponse>(city, () => fetchJson(`/api/gtfs/city-vehicles?city=${encodeURIComponent(city)}`), {
    refreshMs: REFRESH_MS,
  })
  const now = useNow(AGE_TICK_MS)
  const vehicles = useMemo(
    () => data?.vehicles.map((v) => ({ ...v, ageSec: Math.round((effectiveAgeMs(v.ageSec * 1000, lastSuccessAt, now) ?? 0) / 1000) })) ?? NO_VEHICLES,
    [data, lastSuccessAt, now]
  )
  if (data === null) return { ...LOADING_STATE, error, lastSuccessAt }
  const ageMs = effectiveAgeMs(data.feed.ageMs ?? undefined, lastSuccessAt, now) ?? null
  return { vehicles, feed: { state: data.feed.state, ageMs }, alertLines: data.alertLines ?? NO_ALERT_LINES, error, lastSuccessAt }
}
