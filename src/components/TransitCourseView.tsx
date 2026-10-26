'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { TopBar } from './TopBar'
import { PageTitle } from './PageTitle'
import { PageShell } from './aside'
import { LineBadge } from './LineBadge'
import { LineRouteList } from './LineRouteList'
import { MapView, type MapMover } from './MapView'
import { ContextAlerts } from './ContextAlerts'
import { AttributionFooter } from './AttributionFooter'
import { stopDisplayName } from './stopName'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import { useLineVehicles } from '@/hooks/useLineVehicles'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { useNow } from '@/hooks/useNow'
import { HIDE_AFTER_SEC } from './map/mapData'
import { deriveLineAlerts, isLineLoading, lineRefreshMs, type LineResponse } from '@/hooks/useLineDetail'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import type { CourseDetail } from '@/lib/gtfs/courses'
import type { CourseView } from '@/lib/courseView'
import { departureDateLabel, safeStopReturnHref, timetableHref } from '@/lib/courseView'
import { encodeStopIdForPathSegment } from '@/lib/validation'
import { patchUrlParams } from '@/lib/urlState'
import { formatDataTimestamp } from '@/lib/dataTimestamp'
import { projectCoursePosition, type VehicleOnRoute } from '@/lib/gtfs/vehicleProject'
import { CourseVehicleActions } from './CourseVehicleActions'

type Response = LineResponse & { course: CourseDetail | null; schedule: TransitBoardResponse['schedule']; attribution: string[] }

export function TransitCourseView({ city, routeId, selection, returnTo }: { city: string; routeId: string; selection: CourseView; returnTo?: string | null }) {
  const key = `${city}:${routeId}:${selection.tripId}:${selection.serviceDate}`
  const { data, error, lastSuccessAt, refresh } = usePolling<Response>(`course:${key}`, () => fetchJson(`/api/gtfs/line?${new URLSearchParams({ city, route: routeId, trip: selection.tripId, date: selection.serviceDate })}`), { refreshMs: lineRefreshMs, isLoading: isLineLoading, cacheNamespace: 'gtfs-course' })
  const course = data?.course ?? null
  const line = data?.line ?? null
  const [sequenceChoice, setSequenceChoice] = useState<number | null>(null)
  const selectedIndex = course === null ? -1 : course.stops.findIndex((s) => s.sequence === (sequenceChoice ?? selection.sequence) && (sequenceChoice !== null || selection.stopId === null || s.stopId === selection.stopId))
  const selected = course?.stops[selectedIndex]
  const backStop = selection.stopId ?? course?.stops[0]?.stopId
  const backHref = safeStopReturnHref(returnTo ?? null, city) ?? (backStop == null ? `/city/${city}/line/${encodeURIComponent(routeId)}` : `/city/${city}/stop/${encodeStopIdForPathSegment(backStop)}?przystanek=${encodeURIComponent(backStop)}`)
  const live = useLineVehicles(city, routeId, course !== null && (course.directionId === 0 || course.directionId === 1) ? course.directionId : 2, course?.tripId, course === null ? undefined : { date: course.serviceDate, stop: selected?.stopId, seq: selected?.sequence })
  const actionVehicle = live.vehicles.find((vehicle) => vehicle.tripId === course?.tripId && vehicle.serviceDate === course?.serviceDate)
  const positionNow = useSnapshotNow(live.vehicles)
  const clock = useNow(10_000)
  const { resolvedTheme } = useTheme()
  const pins = useMemo(() => course?.stops.map((s, i) => ({ id: String(i), lat: s.lat, lon: s.lon, label: stopDisplayName(s.name, s.code), mode: line?.mode, kind: line?.kind })) ?? [], [course, line?.mode, line?.kind])
  const route = useMemo(() => ({ points: course?.shape?.map(([lat, lon]) => ({ lat, lon })) ?? course?.stops ?? [], mode: line?.mode ?? 'other', kind: line?.kind ?? 'regular' }), [course, line?.mode, line?.kind])
  // Feed projection targets the representative direction, so recompute against the selected actual variant.
  const vehicles = useMemo<VehicleOnRoute[]>(() => {
    if (course === null) return []
    const first = course.stops[0]?.plannedAt
    const last = course.stops.at(-1)?.plannedAt
    if (first === undefined || last === undefined) return []
    // trip_id is reused on successive service dates; match the dated planned window, including GTFS >24h.
    // The one-hour margin does not infer punctuality; it only avoids attaching another day's vehicle.
    const from = Date.parse(first) - 3600_000
    const to = Date.parse(last) + 3600_000
    return live.vehicles.filter((v) => v.tripId === course.tripId).flatMap((v) => {
      const observedAt = positionNow - v.ageSec * 1000
      if (clock - observedAt > HIDE_AFTER_SEC * 1000) return []
      if (observedAt < from || observedAt > to) return []
      const projection = projectCoursePosition(v, course.stops)
      return projection === null ? [] : [{ ...v, ...projection }]
    })
  }, [course, live.vehicles, positionNow, clock])
  const movers = useMemo<MapMover[]>(() => vehicles.map((v) => ({ id: v.tripId + v.sideNumber, lat: v.lat, lon: v.lon, label: `Pojazd ${v.sideNumber} · GPS`, mode: line?.mode ?? 'other', kind: line?.kind ?? 'regular', bearing: v.bearing })), [vehicles, line?.mode, line?.kind])
  const selectRef = useRef<(index: number) => void>(() => {})
  function selectStop(index: number) {
    const stop = course?.stops[index]
    if (stop === undefined) return
    setSequenceChoice(stop.sequence)
    patchUrlParams({ seq: String(stop.sequence), stop: stop.stopId })
  }
  useEffect(() => { selectRef.current = selectStop })
  const onMapPinClick = useCallback((id: string) => selectRef.current(Number(id)), [])
  const loading = data === null && error === null || data?.schedule.state === 'loading'
  const alertState = deriveLineAlerts(data, error !== null)

  return (
    <PageShell>
      <TopBar city={city} backHref={backHref} backLabel="Wróć do odjazdów" crumbs={[{ label: 'Kurs' }]} />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {line !== null && <div className="flex w-[88px] shrink-0 flex-col items-start"><LineBadge line={line.line} mode={line.mode} kind={line.kind} /><CourseVehicleActions city={city} vehicle={actionVehicle} /></div>}
          <PageTitle>{line === null ? 'Kurs z rozkładu' : `Kurs linii ${line.line}`}</PageTitle>
        </div>
        <Link href={backHref} className="chip-filter self-start">Wróć do odjazdów</Link>
        {loading ? <p role="status" aria-busy="true">Wczytywanie kursu…</p> : course === null ? (
          <div className="glass rounded-2xl p-4">
            <p role="status">{error !== null || data?.schedule.state === 'failed' ? 'Nie udało się pobrać kursu.' : 'Ten kurs nie jest dostępny w aktualnym rozkładzie.'}</p>
            <Link href={`/city/${city}/line/${encodeURIComponent(routeId)}`} className="chip-filter mt-3">Zobacz rozkład linii</Link>
            {error !== null && <button type="button" onClick={refresh} className="chip-filter ml-2">Spróbuj ponownie</button>}
          </div>
        ) : line !== null && (
          <>
            <section className="glass rounded-2xl p-4">
              <h2 className="font-semibold text-foreground">kierunek {course.headsign ?? course.stops.at(-1)?.name ?? 'nieznany'}</h2>
              <p className="mt-1 text-sm text-text-secondary">Dzień kursowania: {course.serviceDate.split('-').reverse().join('.')} · wg rozkładu</p>
              {lastSuccessAt !== null && <p className="mt-1 text-[13px] text-text-secondary" role={error === null ? undefined : 'status'}>{error === null ? 'Pobrano ' : 'Nie udało się odświeżyć · dane z '}{formatDataTimestamp(lastSuccessAt)}</p>}
              {selected !== undefined && <Link href={timetableHref(city, routeId, selected.stopId, course.directionId, course.stops.slice(0, selectedIndex).filter((s) => s.stopId === selected.stopId).length)} className="chip-filter mt-3">Rozkład: {stopDisplayName(selected.name, selected.code)}</Link>}
            </section>
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
              <section className="glass min-w-0 rounded-2xl p-4">
                <LineRouteList city={city} stops={course.stops} plannedTimes={course.stops.map((s) => s.plannedAt)} selectedStopId={selected?.stopId ?? null} selectedIndex={selectedIndex} selectedBaseSec={course.departureSec} onSelectStop={(_, index) => { if (index !== undefined) selectStop(index) }} mode={line.mode} kind={line.kind} vehicles={vehicles} />
                {course.stops.some((s) => departureDateLabel(s.plannedAt, Date.parse(course.stops[0].plannedAt)) !== null) && <p className="mt-3 text-[13px] text-text-secondary">Trasa obejmuje więcej niż jeden dzień. Godziny są podane według rozkładu.</p>}
              </section>
              <section className="glass min-w-0 rounded-2xl p-4">
                <h2 className="mb-2 text-sm font-bold text-foreground">Mapa kursu</h2>
                {course.shape === null && <p className="mb-3 text-[13px] text-text-secondary">Schemat połączeń między przystankami — brak geometrii trasy.</p>}
                {course.stops.length >= 2 ? <MapView pins={pins} route={route} movers={movers} selectedPinId={selectedIndex < 0 ? undefined : String(selectedIndex)} onPinClick={onMapPinClick} ariaLabel={`Mapa kursu linii ${line.line}`} dark={resolvedTheme === 'dark'} compact /> : <p>Brak punktów do pokazania trasy.</p>}
                <p className="mt-3 text-[13px] text-text-secondary">{live.error !== null || live.feed.state === 'failed' ? 'Nie udało się pobrać pozycji pojazdu.' : live.feed.state === 'loading' ? 'Wczytywanie pozycji pojazdu…' : live.feed.state === 'unavailable' ? 'Brak danych o pozycjach pojazdów tego środka transportu.' : vehicles.length === 0 ? 'Brak pozycji GPS dla tego kursu.' : 'Pozycja GPS pojazdu; nie określa punktualności.'}</p>
              </section>
            </div>
            <section className="glass rounded-2xl p-4"><ContextAlerts alerts={data?.alerts ?? null} state={alertState.state} stale={alertState.stale} scopeLabel={`Komunikaty linii ${line.line}`} /></section>
          </>
        )}
        {data !== null && <AttributionFooter attribution={data.attribution} />}
      </div>
    </PageShell>
  )
}
