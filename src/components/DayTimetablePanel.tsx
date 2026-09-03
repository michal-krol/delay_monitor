'use client'

import { useEffect, useState } from 'react'
import type { TimetableEntry } from '@/lib/gtfs/query'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import { DayTimetable } from './DayTimetable'

type TimetableResponse = { entries: TimetableEntry[]; schedule: TransitBoardResponse['schedule'] }

type Props = {
  city: string
  stopId: string
  routeId: string
  /** Numer linii do nagłówka („Cała doba — linia 20"). */
  lineLabel: string
}

/**
 * Pełna tabliczka dobowa wybranej linii na przystanku — ładowana na żądanie
 * (`/api/gtfs/timetable`), gdy użytkownik zawęzi tablicę do jednej linii.
 */
export function DayTimetablePanel({ city, stopId, routeId, lineLabel }: Props) {
  const [data, setData] = useState<TimetableResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let retry = 0
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset przy zmianie linii
    setData(null)
    setFailed(false)

    function tick(): void {
      fetch(
        `/api/gtfs/timetable?city=${encodeURIComponent(city)}&stop=${encodeURIComponent(stopId)}&route=${encodeURIComponent(routeId)}`
      )
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((json: TimetableResponse) => {
          if (cancelled) return
          setData(json)
          // Rozkład jeszcze się wczytuje — puste `entries` nie znaczy „nie kursuje".
          if (json.schedule.state === 'loading' && retry < 5) {
            timer = setTimeout(tick, 1500)
            retry += 1
          }
        })
        .catch(() => {
          if (!cancelled) setFailed(true)
        })
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [city, stopId, routeId])

  const entries = data?.entries ?? null
  const stillLoading = data !== null && data.schedule.state === 'loading'

  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--surface-border)' }}>
      <h3 className="text-sm font-semibold text-foreground">Cała doba — linia {lineLabel}</h3>
      {failed ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">Nie udało się pobrać tabliczki dobowej.</p>
      ) : (
        <DayTimetable entries={entries ?? []} loading={entries === null || stillLoading} />
      )}
    </div>
  )
}
