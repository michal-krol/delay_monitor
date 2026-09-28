'use client'

import type { RailStationStatus } from '@/lib/board/railStationStatus'
import type { MapRailStation } from '@/lib/weather/coordinates'
import { fetchJson, usePolling } from './usePolling'

const STATUS_REFRESH_MS = 90_000

/**
 * Ogólnopolska lista stacji do warstwy kolei (`/api/rail-stations/list`) — jedno
 * pobranie na wizytę (lista zmienia się tylko z wdrożeniem). Trzy stany (#7):
 * `stations: null` + `error: false` = wczytuje się, `error: true` = nie udało
 * się (ponawiamy co 30 s), lista = dane.
 */
export function useRailStations(): { stations: MapRailStation[] | null; error: boolean } {
  const { data, error } = usePolling<{ stations: MapRailStation[] }>('rail-stations', () => fetchJson('/api/rail-stations/list'), { refreshMs: null })
  return { stations: data?.stations ?? null, error: error !== null }
}

/**
 * Status JEDNEJ stacji z pamięci pollera — pytamy tylko, gdy jej karta jest
 * otwarta (`stationId !== null`), co 90 s (rytm pollera, AGENTS.md #3; pauza na
 * ukrytej karcie w `usePolling`).
 * `status`: `undefined` = wczytuje się, `null` = poller tej stacji nie ma
 * w pamięci (nikt nie oglądał jej tablicy) — to „nie wiadomo", nie „brak odjazdów".
 */
export function useRailStationStatus(stationId: string | null): { status: RailStationStatus | null | undefined; error: boolean } {
  // Opakowanie `{ status }`, bo „poller nie zna stacji" (`null`) musi się różnić od „jeszcze brak odpowiedzi" (`data === null`).
  const { data, error } = usePolling<{ status: RailStationStatus | null }>(
    stationId,
    async () => {
      const json = await fetchJson<{ stations: RailStationStatus[] }>('/api/rail-stations/status')
      return { status: json.stations.find((s) => s.id === stationId) ?? null }
    },
    { refreshMs: STATUS_REFRESH_MS }
  )
  return { status: data === null ? undefined : data.status, error: error !== null }
}
