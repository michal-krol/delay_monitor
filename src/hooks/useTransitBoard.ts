'use client'

import { useEffect, useState } from 'react'
import type { GtfsDeparture, GtfsMode, ScheduleState } from '@/lib/gtfs/types'

export type TransitStopBoard = {
  stopId: string
  name: string
  modes: GtfsMode[]
  departures: GtfsDeparture[]
}

export type TransitBoardResponse = {
  city: string
  schedule: {
    state: ScheduleState
    loadedAt: string | null
    ageMs: number | null
    phase: string | null
    serviceDates: [string, string, string] | null
    feedVersion: string | null
  }
  stops: (TransitStopBoard | null)[]
  attribution: string[]
}

/**
 * Ten sam ręczny wzorzec `setTimeout` + `document.hidden` co `useBoard`, ale
 * inny backoff: `stop_times` mierzone lokalnie na 3,0 s, całe ładowanie to rząd
 * kilkunastu sekund (PKP odpowiada w 1–3 s, stąd tam `[1,2,4]`).
 */
const REFRESH_INTERVAL_MS = 30000
const LOADING_RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 15000]

export function useTransitBoard(city: string | null, stopIds: string[], limit = 20) {
  const [data, setData] = useState<TransitBoardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = stopIds.join(',')

  useEffect(() => {
    if (city === null || stopIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- czyści nieaktualne dane, gdy nikt nie obserwuje
      setData(null)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let loadingRetry = 0

    async function tick(respectHidden: boolean): Promise<void> {
      if (cancelled) return
      if (respectHidden && document.hidden) {
        timer = setTimeout(() => void tick(true), REFRESH_INTERVAL_MS)
        return
      }

      let loading = false
      try {
        const response = await fetch(
          `/api/gtfs/board?city=${encodeURIComponent(city as string)}&stops=${key}&limit=${limit}`
        )
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json = (await response.json()) as TransitBoardResponse
        if (!cancelled) {
          setData(json)
          setError(null)
        }
        loading = json.schedule.state === 'loading'
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nieznany błąd')
      }
      if (cancelled) return

      const delay =
        loading && loadingRetry < LOADING_RETRY_DELAYS_MS.length
          ? LOADING_RETRY_DELAYS_MS[loadingRetry++]
          : REFRESH_INTERVAL_MS
      timer = setTimeout(() => void tick(true), delay)
    }

    void tick(false)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, key, limit])

  return { data, error }
}
