'use client'

import { fetchJson, usePolling } from './usePolling'
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

/** Rytm serwerowego pollera alertów (`GTFS_ALERT_POLL_MS`, domyślnie 5 min) — częściej nic nowego nie przyjdzie. */
const ALERT_RETRY_MS = 5 * 60_000

/**
 * Statystyki komunikacji miejskiej miasta — jeden fetch z ponawianiem (drabinka
 * `usePolling`), dopóki rozkład się wczytuje (jak `useTransitBoard`, ale bez cyklu
 * odświeżania: rozkład zmienia się raz na dobę).
 *
 * Ponawiamy też, gdy sam rozkład jest już `ready`, ale poller alertów (rytm 5 min,
 * niezależny od rozkładu) jeszcze nie skończył pierwszego pobrania (`alerts == null`)
 * — inaczej widżet utyka na „Wczytuję…" na czas życia komponentu. Feed alertów
 * `failed` to stan znany („nie udało się pobrać", #7), nie ładowanie: zamiast drabinki co
 * 15 s widżet ponawia co `ALERT_RETRY_MS`, żeby zauważyć, gdy serwerowy poller alertów
 * (ponawia co `GTFS_ALERT_POLL_MS`) znów pobierze feed. Tylko na widocznej karcie (`usePolling`).
 */
export function useCityStats(city: string | null) {
  const { data, error } = usePolling<CityStatsResponse>(city, () => fetchJson(`/api/gtfs/city-stats?city=${encodeURIComponent(city as string)}`), {
    refreshMs: (json) => (json.alertFeed?.state === 'failed' ? ALERT_RETRY_MS : null),
    isLoading: (json) => json.state === 'loading' || (json.alerts == null && json.alertFeed?.state !== 'failed'),
  })
  return { data, error }
}
