'use client'

import { useEffect, useState } from 'react'
import type { TimetableEntry } from '@/lib/gtfs/query'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import { DayTimetable } from './DayTimetable'

type TimetableResponse = { entries: TimetableEntry[]; serviceDate?: string; schedule: TransitBoardResponse['schedule'] }
type Day = 'today' | 'tomorrow'

type Props = {
  city: string
  stopId: string
  routeId: string
  /** Numer linii do nagłówka. */
  lineLabel: string
}

/**
 * Tabliczka dobowa wybranej linii na przystanku — dziś i następny dzień
 * (przełącznik). Ładowana na żądanie, gdy użytkownik zawęzi tablicę do linii.
 */
export function DayTimetablePanel({ city, stopId, routeId, lineLabel }: Props) {
  const [data, setData] = useState<TimetableResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [day, setDay] = useState<Day>('today')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let retry = 0
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset przy zmianie linii/doby
    setData(null)
    setFailed(false)

    function tick(): void {
      fetch(
        `/api/gtfs/timetable?city=${encodeURIComponent(city)}&stop=${encodeURIComponent(stopId)}&route=${encodeURIComponent(routeId)}&day=${day}`
      )
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((json: TimetableResponse) => {
          if (cancelled) return
          setData(json)
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
  }, [city, stopId, routeId, day])

  const entries = data?.entries ?? null
  const stillLoading = data !== null && data.schedule.state === 'loading'

  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--surface-border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Tabliczka dobowa — linia {lineLabel}</h3>
        <div className="flex gap-1" role="group" aria-label="Doba">
          {(['today', 'tomorrow'] as Day[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={day === option}
              onClick={() => setDay(option)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                day === option ? 'text-white' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              style={day === option ? { background: 'var(--accent-gradient)', borderColor: 'transparent' } : { borderColor: 'var(--surface-border)' }}
            >
              {option === 'today' ? 'Dziś' : 'Jutro'}
            </button>
          ))}
        </div>
      </div>
      {failed ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">Nie udało się pobrać tabliczki dobowej.</p>
      ) : (
        <DayTimetable entries={entries ?? []} loading={entries === null || stillLoading} />
      )}
    </div>
  )
}
