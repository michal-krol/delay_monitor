'use client'

import { useEffect, useState } from 'react'
import type { RailStationStatus } from '@/lib/board/railStationStatus'
import type { MapRailStation } from '@/lib/weather/coordinates'

const RETRY_MS = 30_000
const STATUS_REFRESH_MS = 90_000

/**
 * Ogólnopolska lista stacji do warstwy kolei (`/api/rail-stations/list`) — jedno
 * pobranie na wizytę (lista zmienia się tylko z wdrożeniem). Trzy stany (#7):
 * `stations: null` + `error: false` = wczytuje się, `error: true` = nie udało
 * się (ponawiamy co 30 s), lista = dane.
 */
export function useRailStations(): { stations: MapRailStation[] | null; error: boolean } {
  const [state, setState] = useState<{ stations: MapRailStation[] | null; error: boolean }>({ stations: null, error: false })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/rail-stations/list')
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as { stations: MapRailStation[] }
        if (!cancelled) setState({ stations: json.stations, error: false })
      } catch {
        if (cancelled) return
        setState((s) => ({ ...s, error: true }))
        timer = setTimeout(() => void load(), RETRY_MS)
      }
    }

    void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return state
}

/**
 * Status JEDNEJ stacji z pamięci pollera — pytamy tylko, gdy jej karta jest
 * otwarta (`stationId !== null`), co 90 s (rytm pollera, AGENTS.md #3).
 * `status`: `undefined` = wczytuje się, `null` = poller tej stacji nie ma
 * w pamięci (nikt nie oglądał jej tablicy) — to „nie wiadomo", nie „brak odjazdów".
 */
export function useRailStationStatus(stationId: string | null): { status: RailStationStatus | null | undefined; error: boolean } {
  const [state, setState] = useState<{ id: string | null; status: RailStationStatus | null | undefined; error: boolean }>({
    id: null,
    status: undefined,
    error: false,
  })

  useEffect(() => {
    if (stationId === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function tick(): Promise<void> {
      if (!document.hidden) {
        try {
          const response = await fetch('/api/rail-stations/status')
          if (!response.ok) throw new Error(String(response.status))
          const json = (await response.json()) as { stations: RailStationStatus[] }
          if (!cancelled) setState({ id: stationId, status: json.stations.find((s) => s.id === stationId) ?? null, error: false })
        } catch {
          if (!cancelled) setState((s) => ({ ...s, id: stationId, error: true }))
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), STATUS_REFRESH_MS)
    }

    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [stationId])

  // Stan innej (poprzednio otwartej) stacji nie może przeciec do nowej karty.
  if (state.id !== stationId) return { status: undefined, error: false }
  return { status: state.status, error: state.error }
}
