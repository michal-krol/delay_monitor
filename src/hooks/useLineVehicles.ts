'use client'

import { useEffect, useState } from 'react'
import type { VehicleOnRoute } from '@/lib/gtfs/vehicleProject'

export type LineVehiclesState = {
  vehicles: VehicleOnRoute[]
  feed: { state: string; ageMs: number | null }
  error: string | null
}

const REFRESH_MS = 20_000

/**
 * Poll pozycji pojazdów jednej linii i kierunku (`/api/gtfs/vehicles`) co 20 s.
 * Ten sam ręczny wzorzec `setTimeout` + `document.hidden` co `useTransitBoard`.
 * Zero pola opóźnienia (#13) — payload niesie tylko rzut na sekwencję przystanków.
 * Błąd ustawia `error`, ale zachowuje ostatnią listę `vehicles`. `directionId`
 * spoza {0,1} (nieznany kierunek przebiegu) = brak zapytania — endpoint i tak go
 * nie przyjmuje.
 */
export function useLineVehicles(city: string, routeId: string, directionId: number): LineVehiclesState {
  const [state, setState] = useState<LineVehiclesState>({
    vehicles: [],
    feed: { state: 'loading', ageMs: null },
    error: null,
  })

  useEffect(() => {
    if (directionId !== 0 && directionId !== 1) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function tick(): Promise<void> {
      if (cancelled) return
      if (document.hidden) {
        timer = setTimeout(() => void tick(), REFRESH_MS)
        return
      }
      try {
        const response = await fetch(
          `/api/gtfs/vehicles?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId)}&direction=${directionId}`
        )
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as {
          vehicles: VehicleOnRoute[]
          feed: { state: string; ageMs: number | null }
        }
        if (!cancelled) setState({ vehicles: json.vehicles, feed: json.feed, error: null })
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'błąd' }))
      }
      if (!cancelled) timer = setTimeout(() => void tick(), REFRESH_MS)
    }

    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [city, routeId, directionId])

  return state
}
