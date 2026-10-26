'use client'

import Link from 'next/link'
import { startTransition, useState } from 'react'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import { LG_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import type { StopTimetableEntry, TimetableStop } from '@/lib/gtfs/courses'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import { courseHref } from '@/lib/courseView'
import type { LineDay } from '@/lib/lineViewState'
import { formatSecondsOfDay } from '@/lib/format'
import { stopDisplayName } from './stopName'
import { encodeStopIdForPathSegment } from '@/lib/validation'
import { TabCrossfade } from './TabCrossfade'

const DAYS: { day: LineDay; label: string }[] = [{ day: 'weekday', label: 'Poniedziałek – Piątek' }, { day: 'saturday', label: 'Sobota' }, { day: 'sunday', label: 'Niedziela i święta' }, { day: 'other', label: 'Inne dni' }]
type Response = { timetable: StopTimetableEntry[]; timetableStop?: TimetableStop | null; schedule: TransitBoardResponse['schedule'] }

export function ConcreteTimetable({ city, routeId, directionId, stopId, occurrence, day, onDayChange }: { city: string; routeId: string; directionId: number; stopId: string | null; occurrence: number; day: LineDay; onDayChange: (day: LineDay) => void }) {
  const lgUp = useMediaQuery(LG_UP, true)
  // Only a narrow day choice replaces the grid; polling and resizing keep its DOM and focus.
  const [fadeKey, setFadeKey] = useState(0)
  function changeDay(next: LineDay): void {
    startTransition(() => {
      if (!lgUp) setFadeKey((key) => key + 1)
      onDayChange(next)
    })
  }
  const params = new URLSearchParams({ city, route: routeId, dir: String(directionId), stop: stopId ?? '' })
  const { data, error, refresh } = usePolling<Response>(stopId === null ? null : `timetable:${params}`, () => fetchJson(`/api/gtfs/line?${params}`), { refreshMs: null, isLoading: (response) => response.schedule.state === 'loading', cacheNamespace: 'gtfs-timetable' })
  if (stopId === null) return <p className="mt-3 text-sm text-text-secondary">Wybierz przystanek, aby zobaczyć rozkład.</p>
  if (data === null || data.schedule.state !== 'ready' && data.timetable === undefined) return <div className="mt-3"><p role="status" className="text-sm text-text-secondary">{error === null && data?.schedule.state !== 'failed' ? 'Wczytywanie rozkładu…' : 'Nie udało się pobrać rozkładu.'}</p>{(error !== null || data?.schedule.state === 'failed') && <button type="button" onClick={refresh} className="chip-filter mt-2">Spróbuj ponownie</button>}</div>
  const entries = (data.timetable ?? []).filter((row) => row.occurrence === occurrence)
  if (data.timetableStop === null) return <p role="status" className="mt-3 text-sm text-text-secondary">Wybierz przystanek obsługiwany przez tę linię w tym kierunku.</p>
  const days = DAYS.filter((d) => d.day !== 'other' || entries.some((e) => e.category === 'other'))
  const activeDay = days.some((d) => d.day === day) ? day : 'weekday'
  return <div className="mt-3">
    {data.timetableStop != null && <>
      <div role="group" aria-label="Wybrany rozkład" className="mb-2 rounded-xl border border-surface-border bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{stopDisplayName(data.timetableStop.name, data.timetableStop.code)}{data.timetableStop.headsigns?.length ? <span className="mt-1 block text-[13px] font-medium text-text-secondary">kierunek {data.timetableStop.headsigns.join(' · ')}</span> : null}</div>
      <Link href={`/city/${city}/stop/${encodeStopIdForPathSegment(stopId)}?przystanek=${encodeURIComponent(stopId)}`} className="chip-filter mb-3">Odjazdy z przystanku</Link>
    </>}
    {error !== null && <p role="status" className="mb-2 text-[13px] text-warning-text">Nie udało się odświeżyć — pokazano ostatni rozkład.</p>}
    <div role="group" aria-label="Kategoria dnia" className="mb-3 flex flex-wrap gap-2 lg:hidden">{days.map((d) => <button key={d.day} type="button" aria-pressed={activeDay === d.day} onClick={() => changeDay(d.day)} className="chip-filter">{d.label}</button>)}</div>
    <TabCrossfade id={String(fadeKey)} name="line-day">
    <div className="grid gap-4 lg:grid-cols-3">{days.map((d) => {
      const rows = entries.filter((e) => e.category === d.day || d.day === 'weekday' && e.category === 'friday')
      const hours = [...new Set(rows.map((r) => Math.floor(r.departureSec / 3600)))]
      return <div key={d.day} role="group" aria-label={d.label} className={`min-w-0 ${d.day === activeDay ? '' : 'max-lg:hidden'}`}>
        <h3 className="mb-2 text-[13px] font-semibold text-text-secondary">{d.label}</h3>
        {d.day === 'weekday' && rows.some((r) => r.category === 'friday') && <p className="mb-2 text-[13px] text-text-secondary">„pt.” — osobny rozkład piątkowy; pozostałe minuty pokazują rozkład poniedziałek – czwartek.</p>}
        {rows.length === 0 ? <p className="text-sm text-text-secondary">Brak kursów w tej kategorii dnia.</p> : <ul>{hours.map((hour) => <li key={hour} className="flex items-start gap-2 border-b border-surface-border py-1">
          <span className="w-12 shrink-0 pt-3 text-right font-bold tabular-nums text-foreground">{String(hour % 24).padStart(2, '0')}{hour >= 24 && <span className="block text-[13px] font-medium">+{Math.floor(hour / 24)} dzień</span>}</span>
          <div className="flex min-w-0 flex-wrap gap-1">{rows.filter((r) => Math.floor(r.departureSec / 3600) === hour).map((row) => <Link key={`${row.tripId}:${row.sequence}`} href={courseHref(city, routeId, { tripId: row.tripId, serviceDate: row.serviceDate, stopId, stopSequence: row.sequence })} aria-label={`${formatSecondsOfDay(row.departureSec)}, ${row.category === 'friday' ? 'Piątek' : d.label}, dzień kursowania ${row.serviceDate}`} className="press inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 font-semibold tabular-nums text-primary-text hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary-text">{String(Math.floor(row.departureSec % 3600 / 60)).padStart(2, '0')}{row.category === 'friday' && <span className="ml-0.5 text-[13px]">pt.</span>}</Link>)}</div>
        </li>)}</ul>}
      </div>
    })}</div>
    </TabCrossfade>
    <p className="mt-3 text-[13px] text-text-secondary">Wybierz minutę, aby otworzyć konkretny kurs w najbliższym dostępnym dniu kursowania.</p>
  </div>
}
