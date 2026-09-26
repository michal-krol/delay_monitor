'use client'

import { useEffect, useState } from 'react'
import type { RailStationApiEntry, RailStationPin } from '@/lib/board/railStationPin'
import { toRailStationPin } from '@/lib/board/railStationPin'

export type RailStationsState = {
  stations: RailStationPin[]
  error: string | null
}

const REFRESH_MS = 90_000

/**
 * Poll `/api/rail-stations` co 90 s — rytm pollera PKP (AGENTS.md #3), nie
 * 15 s pojazdów (`useCityVehicles`). Ten sam ręczny wzorzec `setTimeout` +
 * `document.hidden`. Błąd zachowuje ostatnią listę (AGENTS.md #7).
 */
export function useRailStations(city: string): RailStationsState {
  const [state, setState] = useState<RailStationsState>({ stations: [], error: null })

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
        const response = await fetch(`/api/rail-stations?city=${encodeURIComponent(city)}`)
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as { stations: RailStationApiEntry[] }
        if (!cancelled) setState({ stations: json.stations.map(toRailStationPin), error: null })
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
