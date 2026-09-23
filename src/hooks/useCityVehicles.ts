'use client'

import { useEffect, useState } from 'react'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'

export type CityVehiclesState = {
  vehicles: CityVehicle[]
  feed: { state: string; ageMs: number | null }
  error: string | null
}

const REFRESH_MS = 15_000

/**
 * Poll WSZYSTKICH pozycji pojazdów miasta (`/api/gtfs/city-vehicles`) co 15 s —
 * mapa miasta live. Ten sam ręczny wzorzec `setTimeout` + `document.hidden` co
 * `useLineVehicles`. Błąd ustawia `error`, ale zachowuje ostatnią listę
 * `vehicles` (AGENTS #7 — nie czyścić mapy przy chwilowej awarii).
 */
export function useCityVehicles(city: string): CityVehiclesState {
  const [state, setState] = useState<CityVehiclesState>({
    vehicles: [],
    feed: { state: 'loading', ageMs: null },
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function tick(): Promise<void> {
      if (cancelled) return
      if (document.hidden) {
        timer = setTimeout(() => void tick(), REFRESH_MS)
        return
      }
      try {
        const response = await fetch(`/api/gtfs/city-vehicles?city=${encodeURIComponent(city)}`)
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as { vehicles: CityVehicle[]; feed: { state: string; ageMs: number | null } }
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
  }, [city])

  return state
}
