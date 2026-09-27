'use client'

import { useEffect, useState } from 'react'
import type { CityStop } from '@/lib/gtfs/query'

const LOADING_RETRY_MS = 2_000
const ERROR_RETRY_MS = 30_000

/**
 * Przystanki miasta do warstwy przystanków (`/api/gtfs/stops`). Jedno pobranie;
 * `stops: null` w odpowiedzi = rozkład jeszcze się wczytuje → ponawiamy co 2 s.
 * Trzy stany (#7): `null` + `error: false` = wczytuje się, `error: true` = nie
 * udało się (ponawiamy co 30 s), lista = dane.
 */
export function useCityStops(city: string): { stops: CityStop[] | null; error: boolean } {
  const [state, setState] = useState<{ city: string; stops: CityStop[] | null; error: boolean }>({ city, stops: null, error: false })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function load(): Promise<void> {
      try {
        const response = await fetch(`/api/gtfs/stops?city=${encodeURIComponent(city)}`)
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as { stops: CityStop[] | null }
        if (cancelled) return
        if (json.stops === null) {
          timer = setTimeout(() => void load(), LOADING_RETRY_MS)
          return
        }
        setState({ city, stops: json.stops, error: false })
      } catch {
        if (cancelled) return
        setState((s) => ({ ...s, city, error: true }))
        timer = setTimeout(() => void load(), ERROR_RETRY_MS)
      }
    }

    void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [city])

  return state.city === city ? { stops: state.stops, error: state.error } : { stops: null, error: false }
}
