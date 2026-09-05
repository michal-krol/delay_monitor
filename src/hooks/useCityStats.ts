'use client'

import { useEffect, useState } from 'react'
import type { AlertRecord } from '@/lib/gtfs/alerts'
import type { CityStats } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'

export type CityStatsResponse = {
  city: string
  state: 'loading' | 'ready' | 'failed'
  stats: CityStats | null
  /** Pozycje pojazdów (etap 5) — `null` = feed nie gotowy, NIGDY nie renderuj jako 0 (#7). */
  vehiclesInService?: Record<GtfsMode, number> | null
  vehiclesUnmatched?: number | null
  vehicleFeed?: { state: string; ageMs: number | null }
  /** Alerty (etap 5b) — `null` = feed nie gotowy, NIGDY nie renderuj jako [] (#7). */
  alerts?: AlertRecord[] | null
  alertFeed?: { state: string; ageMs: number | null }
}

/**
 * Statystyki komunikacji miejskiej miasta — jeden fetch z ponawianiem, dopóki
 * rozkład się wczytuje (jak `useTransitBoard`, ale bez cyklu odświeżania:
 * rozkład zmienia się raz na dobę).
 */
const LOADING_RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 15000]

export function useCityStats(city: string | null) {
  const [data, setData] = useState<CityStatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (city === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let retry = 0

    function tick(): void {
      fetch(`/api/gtfs/city-stats?city=${encodeURIComponent(city as string)}`)
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status))
          return response.json() as Promise<CityStatsResponse>
        })
        .then((json) => {
          if (cancelled) return
          setData(json)
          setError(null)
          // Ponawiamy też, gdy sam rozkład jest już `ready`, ale poller alertów
          // (rytm 5 min, niezależny od rozkładu) jeszcze nie skończył pierwszego
          // pobrania (`alerts == null`) — inaczej widżet utyka na „Wczytuję…"
          // na czas życia komponentu. Ta sama, ograniczona drabinka ponowień.
          if ((json.state === 'loading' || json.alerts == null) && retry < LOADING_RETRY_DELAYS_MS.length) {
            timer = setTimeout(tick, LOADING_RETRY_DELAYS_MS[retry++])
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Nieznany błąd')
        })
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [city])

  return { data, error }
}
