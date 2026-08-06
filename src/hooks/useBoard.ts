'use client'

import { useEffect, useState } from 'react'

export type BoardApiRow = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainNumber: string
  trainLabel: string
  carrier: string
  carrierName: string | null
  category: string
  headsign: string | null
  plannedAt: string
  actualAt: string | null
  /** `null`, gdy przystanek nie jest jeszcze potwierdzony (`status` będzie wtedy `notStarted`). */
  delayMinutes: number | null
  status: 'onTime' | 'delayed' | 'cancelled' | 'unknown' | 'notStarted'
  platform: string | null
}

export type BoardApiSnapshot = {
  stationId: string
  stationName: string
  departures: BoardApiRow[]
  arrivals: BoardApiRow[]
  fetchedAt: string
  ageMs: number
}

export type BoardApiResponse = {
  snapshots: (BoardApiSnapshot | null)[]
  budget: { hourly: number | null; daily: number | null } | undefined
  status: 'ok' | 'configError' | 'degraded'
  throttled: boolean
}

const REFRESH_INTERVAL_MS = 30000

export function useBoard(stationIds: string[]) {
  const [data, setData] = useState<BoardApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = stationIds.join(',')

  useEffect(() => {
    if (stationIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets stale data when the caller stops watching any station
      setData(null)
      return
    }

    let cancelled = false

    async function fetchBoard(): Promise<void> {
      try {
        const response = await fetch(`/api/board?stations=${key}`)
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json = (await response.json()) as BoardApiResponse
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nieznany błąd')
      }
    }

    void fetchBoard()
    const interval = setInterval(() => {
      if (document.hidden) return
      void fetchBoard()
    }, REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, error }
}
