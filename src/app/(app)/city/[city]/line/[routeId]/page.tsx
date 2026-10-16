'use client'

import { startTransition, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { notFound, useParams, useSearchParams } from 'next/navigation'
import { PageTitle } from '@/components/PageTitle'
import { TopBar } from '@/components/TopBar'
import { ContextAlerts } from '@/components/ContextAlerts'
import { LineBadge } from '@/components/LineBadge'
import { LineRouteList } from '@/components/LineRouteList'
import { LineTimetable } from '@/components/LineTimetable'
import { MapView, type MapMover, type MapPin } from '@/components/MapView'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { TabCrossfade } from '@/components/TabCrossfade'
import { TransitFetchStatus } from '@/components/TransitFetchStatus'
import { stopDisplayName } from '@/components/stopName'
import { AttributionFooter } from '@/components/AttributionFooter'
import { AsideCard, PageShell } from '@/components/aside'
import { AlertCircleIcon, ArrowLeftIcon, ChevronRightIcon, ICON_SIZE, MapIcon, SwapIcon } from '@/components/icons'
import { LINE_KIND_LABEL, MODE_ICON, MODE_LABEL } from '@/components/transitMode'
import { formatAgo, formatSecondsOfDay } from '@/lib/format'
import { dedupeAlerts } from '@/lib/gtfs/alertView'
import { getCity } from '@/lib/gtfs/cities'
import { NAV_BACK_TYPES, NAV_FORWARD_TYPES } from '@/lib/navTransition'
import { lineViewPatch, parseLineViewState, resolveLineView, type LinePane, type LineViewState } from '@/lib/lineViewState'
import { pluralPl } from '@/lib/plural'
import { patchUrlParams } from '@/lib/urlState'
import { useCities } from '@/hooks/useCities'
import { deriveLineAlerts, isLineLoading, lineRefreshMs, type LineResponse } from '@/hooks/useLineDetail'
import { useLineVehicles, type LineVehiclesState } from '@/hooks/useLineVehicles'
import { LG_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { useNearViewport } from '@/hooks/useNearViewport'
import { useRecentLines } from '@/hooks/useRecentLines'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import type { LineDetail } from '@/lib/gtfs/query'
import type { LineKind } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN, encodeStopIdForPathSegment } from '@/lib/validation'

/** Odpowiedź `/api/gtfs/line`: typ z hooka (stan komunikatów) + pola, których strona używa dodatkowo. */
type PageLineResponse = LineResponse & {
  schedule: TransitBoardResponse['schedule']
  attribution: string[]
}

// Stała referencja: `stops` wchodzi do zależności `useMemo` mapy.
const NO_STOPS: LineDetail['directions'][number]['stops'] = []

const PANES: { key: LinePane; label: string }[] = [
  { key: 'route', label: 'Trasa' },
  { key: 'timetable', label: 'Rozkład' },
]

/** Przystanek, za którym jest pojazd — jeden konkretny, więc z numerem („za „Centrum 02”"). */
function afterStopName(stops: typeof NO_STOPS, index: number): string {
  const stop = stops[index]
  return stop !== undefined ? stopDisplayName(stop.name, stop.code) : '—'
}

export default function LineDetailPage() {
  const params = useParams<{ city: string; routeId: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const routeId = typeof params.routeId === 'string' ? params.routeId : ''

  if (!CITY_ID_PATTERN.test(city) || !GTFS_ROUTE_ID_PATTERN.test(routeId)) {
    notFound()
  }

  // `key`: wybór kierunku, przystanku i widoku nie przechodzi na inną linię.
  return <LineDetailView key={`${city}/${routeId}`} city={city} routeId={routeId} />
}

function LineDetailView({ city, routeId }: { city: string; routeId: string }) {
  const { cities } = useCities()
  const searchParams = useSearchParams()
  const lgUp = useMediaQuery(LG_UP, true)
  // `undefined` = idź za URL-em, inaczej wybór usera w tej sesji (jak w `TransitStopDetail`).
  const [dirChoice, setDirChoice] = useState<number | undefined>(undefined)
  const [stopChoice, setStopChoice] = useState<string | null | undefined>(undefined)
  /** Który wiersz wybranego `stopId` (pętla powtarza przystanek; URL niesie tylko `stopId` = pierwsze wystąpienie). Ważny, dopóki pasuje do `stopId` widoku. */
  const [stopIndexChoice, setStopIndexChoice] = useState<number | undefined>(undefined)
  const [paneChoice, setPaneChoice] = useState<LinePane | undefined>(undefined)
  /** Wybrany kurs (start z pierwszego przystanku) — zawsze lokalny, nigdy w URL-u; ważny tylko dla kierunku, w którym go wybrano. */
  const [base, setBase] = useState<{ directionId: number; sec: number } | null>(null)
  const segmentRef = useRef<HTMLDivElement>(null)
  const alertsRef = useRef<HTMLDivElement>(null)
  const mapHeadingId = useId()

  // Jedno pobranie z ponawianiem (drabinka `usePolling`, nigdy się nie poddaje), dopóki rozkład się wczytuje albo alerty są nieznane; po błędzie ponowienie co 30 s.
  const { data, error, lastSuccessAt, refresh } = usePolling<PageLineResponse>(
    `${city}:${routeId}`,
    () => fetchJson(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId)}`),
    { refreshMs: lineRefreshMs, isLoading: isLineLoading }
  )
  const failed = error !== null

  const entry = useMemo(() => cities.find((option) => option.id === city) ?? null, [cities, city])
  const cityName = entry?.name ?? city
  const timeZone = getCity(city)?.timezone ?? 'Europe/Warsaw'

  const line = data?.line ?? null

  // „Ostatnio oglądane": zapis dopiero, gdy linia się wczytała (nigdy dla nieznanego id)
  // i tylko raz na trasę — nie przy każdym odświeżeniu danych ani zmianie motywu.
  const { record: recordRecent } = useRecentLines(city)
  const recordedRef = useRef<string | null>(null)
  const lineKnown = line !== null
  useEffect(() => {
    const key = `${city}:${routeId}`
    if (!lineKnown || recordedRef.current === key) return
    recordedRef.current = key
    recordRecent(routeId)
  }, [lineKnown, city, routeId, recordRecent])

  // Stan widoku: URL (`dir`, `stop`, `pane`, `day`) nadpisany wyborami z tej sesji; dane rozstrzygają, co jest poprawne.
  const urlView = parseLineViewState(searchParams)
  const view: LineViewState = {
    directionId: dirChoice !== undefined ? dirChoice : urlView.directionId,
    stopId: stopChoice !== undefined ? stopChoice : urlView.stopId,
    pane: paneChoice ?? urlView.pane,
    day: urlView.day,
  }
  const directions = line?.directions ?? []
  // Kopia tablicy: React Compiler uznaje argument wywołania za możliwie mutowany i odrzuca `useMemo` mapy niżej (`stops` pochodzi z `directions`).
  const resolved = resolveLineView(view, [...directions])
  const direction = resolved === null ? undefined : directions[resolved.directionIndex]
  const stops = direction?.stops ?? NO_STOPS
  const pickedIndex = stopIndexChoice !== undefined && stops[stopIndexChoice]?.stopId === view.stopId ? stopIndexChoice : undefined
  const selectedIndex = pickedIndex ?? resolved?.stopIndex ?? -1
  const selectedStop = stops[selectedIndex]
  const pane = view.pane
  const selectedBaseSec = base !== null && direction?.directionId === base.directionId ? base.sec : null

  const alertsView = deriveLineAlerts(data, failed)
  const alertList = data?.alerts ?? null
  const alertCount = alertList === null ? 0 : dedupeAlerts(alertList).length

  const scheduleLoading = data !== null && line === null && data.schedule.state === 'loading'
  const loading = (data === null && !failed) || scheduleLoading
  const loadFailed = (data === null && failed) || (data !== null && line === null && data.schedule.state === 'failed')

  // Endpoint pozycji przyjmuje wyłącznie kierunek 0/1; przebieg bywa oznaczony `2` (nieznany) — wtedy hook nie pyta
  // i nie renderujemy markerów ani listy pojazdów.
  const showVehicles = direction !== undefined && (direction.directionId === 0 || direction.directionId === 1)
  const liveVehicles = useLineVehicles(city, routeId, showVehicles ? direction.directionId : 2)

  // Mapa linii: piny = przystanki przebiegu (id = indeks, bo ten sam przystanek może wystąpić
  // dwa razy), pojazdy z tego samego pollingu co lista „Pojazdy w trasie" -- zero nowych zapytań.
  const mapPins = useMemo<MapPin[]>(
    () =>
      stops.map((stop, index) => ({
        id: String(index),
        lat: stop.lat,
        lon: stop.lon,
        label: stopDisplayName(stop.name, stop.code),
        mode: line?.mode,
        kind: line?.kind,
        href: `/city/${city}/stop/${encodeStopIdForPathSegment(stop.stopId)}?name=${encodeURIComponent(stop.name)}`,
      })),
    [stops, line?.mode, line?.kind, city]
  )
  // Rodzaj do koloru mapy; `'regular'` tylko na czas ładowania linii — sekcja mapy renderuje się dopiero, gdy `line` jest znane.
  const mapKind: LineKind = line?.kind ?? 'regular'
  const mapRoute = useMemo(
    () => ({ points: direction?.shape?.map(([lat, lon]) => ({ lat, lon })) ?? stops, mode: line?.mode ?? 'bus', kind: mapKind }),
    [direction?.shape, stops, line?.mode, mapKind]
  )
  const mapMovers = useMemo<MapMover[]>(() => {
    if (!showVehicles) return []
    return liveVehicles.vehicles.map((v) => ({
      id: v.sideNumber + v.tripId,
      lat: v.lat,
      lon: v.lon,
      label: `#${v.sideNumber} · za „${afterStopName(stops, v.afterStopOrder)}”`,
      mode: line?.mode ?? 'bus',
      kind: mapKind,
      bearing: v.bearing,
    }))
  }, [showVehicles, liveVehicles.vehicles, stops, line?.mode, mapKind])
  const { resolvedTheme } = useTheme()
  // MapLibre (WebGL, worker, kafelki) startuje dopiero, gdy sekcja zbliży się do ekranu — raz, bez odmontowania.
  const [mapSectionRef, mapNear] = useNearViewport()

  // Każda akcja zapisuje TYLKO swoje klucze: `searchParams` z Next nie nadąża za `replaceState`, więc przepisywanie
  // pozostałych (np. `dir` po zmianie kierunku) z tego stanu kasowałoby je z URL-a.
  function writeUrl(next: LineViewState, keys: ('dir' | 'stop' | 'pane')[]): void {
    const full = lineViewPatch(next)
    patchUrlParams(Object.fromEntries(keys.map((key) => [key, full[key]])))
  }

  function selectPane(next: LinePane): void {
    startTransition(() => setPaneChoice(next))
    writeUrl({ ...view, pane: next }, ['pane'])
  }

  function switchDirection(): void {
    if (resolved === null) return
    const next = directions[(resolved.directionIndex + 1) % directions.length]
    setDirChoice(next.directionId)
    setStopChoice(null)
    setStopIndexChoice(undefined)
    setBase(null)
    // Pierwszy kierunek to stan domyślny: powrót do niego usuwa `dir` z URL-a.
    writeUrl({ ...view, directionId: next === directions[0] ? null : next.directionId, stopId: null }, ['dir', 'stop'])
  }

  /** `openTimetable`: wybór z listy trasy — poniżej `lg` przystanek wybiera się po to, żeby zobaczyć jego rozkład. `index`: wiersz (pętla). */
  function selectStop(stopId: string, openTimetable: boolean, index?: number): void {
    if (direction === undefined) return
    const toTimetable = openTimetable && !lgUp && pane !== 'timetable'
    setStopChoice(stopId)
    setStopIndexChoice(index)
    if (toTimetable) {
      startTransition(() => setPaneChoice('timetable'))
      segmentRef.current?.scrollIntoView?.({ block: 'nearest' })
    }
    // `dir` zostaje tym, co niesie URL (wpisuje go tylko zmiana kierunku) — domyślnego kierunku nie dopisujemy.
    writeUrl({ ...view, stopId, pane: toTimetable ? 'timetable' : pane }, ['stop', 'pane'])
  }

  // `MapView` montuje mapę od nowa przy każdej zmianie `onPinClick` (Trap 2, `maps.md`) — a `selectStop` zmienia tożsamość przy
  // każdym renderze. Stały wrapper z ref-em: klik w pin nie niszczy własnego popupu.
  const onPinRef = useRef<(id: string) => void>(() => {})
  useEffect(() => {
    onPinRef.current = (id) => {
      const stop = stops[Number(id)]
      if (stop !== undefined) selectStop(stop.stopId, false, Number(id))
    }
  })
  const onMapPinClick = useCallback((id: string) => onPinRef.current(id), [])

  const asideContent = (
    <>
      {line !== null && direction !== undefined && (
        <AsideCard title={`Linia ${line.line}`}>
          <dl className="flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Rodzaj</dt>
              <dd className="text-foreground">{MODE_LABEL[line.mode]}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Kierunki</dt>
              <dd className="text-foreground">{directions.length}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Przystanki</dt>
              <dd className="text-foreground">{stops.length}</dd>
            </div>
            {direction.departures[0]?.times.length ? (
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Pierwszy / ostatni</dt>
                <dd className="tabular-nums text-foreground">
                  {formatSecondsOfDay(direction.departures[0].times[0])}–{formatSecondsOfDay(direction.departures[0].times.at(-1)!)}
                </dd>
              </div>
            ) : null}
          </dl>
        </AsideCard>
      )}

      {/* Stan pozycji (wczytywanie / błąd / brak feedu / brak pojazdów) mówi wiersz „Pojazdy w tym kierunku" w głównej kolumnie — tu tylko lista. */}
      {showVehicles && direction !== undefined && liveVehicles.vehicles.length > 0 && (
        <AsideCard title={`Pojazdy w trasie${direction.headsign ? ` — ${direction.headsign}` : ''}`}>
          <ul className="flex flex-col gap-1.5 text-xs">
            {liveVehicles.vehicles
              .slice()
              .sort((a, b) => a.afterStopOrder - b.afterStopOrder)
              .map((v) => (
                <li key={v.sideNumber + v.tripId} className="flex justify-between gap-2">
                  <span className="text-foreground">#{v.sideNumber}</span>
                  <span className="text-text-muted">
                    za „{afterStopName(stops, v.afterStopOrder)}”
                    {v.ageSec > 60 && ` · ${formatAgo(v.ageSec)}`}
                  </span>
                </li>
              ))}
          </ul>
        </AsideCard>
      )}
    </>
  )

  const catalogLink = (
    <Link href={`/city/${city}/lines`} transitionTypes={NAV_BACK_TYPES} className="chip-filter mt-3 gap-1.5">
      <ArrowLeftIcon size={ICON_SIZE.button} />
      Wróć do katalogu linii
    </Link>
  )

  const headsign = direction === undefined ? '' : directionName(direction)
  const Icon = line === null ? null : MODE_ICON[line.mode]

  return (
    <PageShell aside={asideContent}>
      <TopBar
        city={city}
        backLabel="Wróć do linii"
        backHref={`/city/${city}/lines`}
        crumbs={[
          { label: 'Linie', href: `/city/${city}/lines` },
          { label: line?.longName ?? 'Linia' },
        ]}
      />

      {line !== null && Icon !== null && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <LineBadge line={line.line} mode={line.mode} kind={line.kind} />
              <PageTitle>{line.longName}</PageTitle>
            </div>
            <p data-testid="line-mode" className="flex items-center gap-1.5 text-sm text-text-secondary">
              <Icon size={ICON_SIZE.inline} />
              <span>
                {MODE_LABEL[line.mode]}
                {LINE_KIND_LABEL[line.kind] !== '' && <span className="text-text-muted"> · linia {LINE_KIND_LABEL[line.kind]}</span>}
              </span>
            </p>
          </div>

          {direction !== undefined && (
            <div className="glass flex items-start gap-3 rounded-2xl p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-muted">Kierunek</p>
                <p className="text-lg font-bold leading-snug text-foreground [overflow-wrap:anywhere]">{headsign}</p>
                {direction.origin != null && direction.origin !== '' && <p className="mt-0.5 text-sm text-text-secondary [overflow-wrap:anywhere]">{`Od: ${direction.origin}`}</p>}
              </div>
              {directions.length >= 2 && (
                <button type="button" onClick={switchDirection} className="chip-filter shrink-0 gap-2 text-primary-text">
                  <SwapIcon size={ICON_SIZE.button} />
                  Zmień kierunek
                </button>
              )}
            </div>
          )}

          {alertCount > 0 && (
            <button
              type="button"
              onClick={() => {
                alertsRef.current?.scrollIntoView?.({ block: 'start' })
                alertsRef.current?.focus({ preventScroll: true })
              }}
              className="press flex min-h-11 w-full items-center gap-2 rounded-xl border border-warning-text bg-surface-strong px-3 text-left text-sm font-medium text-warning-text focus-visible:outline-2 focus-visible:outline-primary-text"
            >
              <AlertCircleIcon size={ICON_SIZE.button} />
              <span className="min-w-0 flex-1">{`${alertCount} ${pluralPl(alertCount, 'komunikat', 'komunikaty', 'komunikatów')}`}</span>
              <ChevronRightIcon size={ICON_SIZE.button} />
            </button>
          )}

          <div>
            {data !== null && <ScheduleStatus schedule={data.schedule} cityName={cityName} title={`Rozkład jazdy linii ${line.line}`} error={failed} />}
            <TransitFetchStatus lastSuccessAt={lastSuccessAt} refreshFailed={failed && data !== null} timeZone={timeZone} onRefresh={refresh} />
          </div>
        </div>
      )}

      {loading ? (
        // Szkielet nagłówka i listy przystanków: bloki są dekoracją, czytnik dostaje jedno zdanie.
        <div data-testid="line-loading" aria-busy="true" className="glass rounded-2xl p-4 sm:p-6">
          <PageTitle>Przebieg linii</PageTitle>
          <p role="status" className="mt-2 text-sm text-text-secondary">
            {scheduleLoading ? 'Wczytywanie rozkładu…' : 'Wczytywanie przebiegu linii…'}
          </p>
          <div aria-hidden="true" className={`${SKELETON_BLOCK} mt-3 h-14 w-full`} />
          <div className="mt-5 flex flex-col gap-4 border-t border-surface-border pt-4">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} aria-hidden="true" className="flex items-center gap-3">
                <div className={`${SKELETON_BLOCK} h-3 w-3 shrink-0 rounded-full`} />
                <div className={`${SKELETON_BLOCK} h-5 w-3/5`} />
                <div className={`${SKELETON_BLOCK} ml-auto h-5 w-12`} />
              </div>
            ))}
          </div>
        </div>
      ) : loadFailed ? (
        <div className="glass rounded-2xl p-4 sm:p-6">
          <PageTitle>Przebieg linii</PageTitle>
          <p role="status" className="mt-2 text-sm text-error-text">
            Nie udało się pobrać przebiegu linii.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={refresh} className="btn-primary mt-3">
              Spróbuj ponownie
            </button>
            {catalogLink}
          </div>
        </div>
      ) : line === null ? (
        <div className="glass rounded-2xl p-4 sm:p-6">
          <PageTitle>Przebieg linii</PageTitle>
          <p className="mt-2 text-sm text-text-secondary">Nie znaleziono linii</p>
          {catalogLink}
        </div>
      ) : (
        <>
          {direction === undefined ? (
            <p role="status" className="text-sm text-text-secondary">
              Brak przebiegu tej linii.
            </p>
          ) : (
            <>
              {/* Poniżej `lg` jedna sekcja naraz; od `lg` obie obok siebie i przełącznik jest schowany. */}
              <div ref={segmentRef} role="group" aria-label="Widok linii" className="segment grid w-full grid-cols-2 lg:hidden">
                {PANES.map((item) => (
                  <button key={item.key} type="button" aria-pressed={pane === item.key} onClick={() => selectPane(item.key)} className="segment-item">
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
                {/* Poniżej `lg` nieaktywna sekcja jest odmontowana (nie tylko schowana): wejście nowej to crossfade.
                    Od `lg` obie sekcje są zamontowane naraz — dwie takie same nazwy `view-transition-name` przerywają przejście (ui-motion.md). */}
                {(lgUp || pane === 'route') && (
                  <TabCrossfade id="route" name={lgUp ? 'line-pane-route' : 'line-pane'}>
                    <section className={`glass rounded-2xl p-4 ${pane === 'route' ? '' : 'max-lg:hidden'}`}>
                      <LineRouteList
                        city={city}
                        stops={stops}
                        selectedStopId={selectedStop?.stopId ?? null}
                        selectedIndex={selectedIndex}
                        selectedBaseSec={selectedBaseSec}
                        onSelectStop={(stopId, index) => selectStop(stopId, true, index)}
                        vehicles={showVehicles ? liveVehicles.vehicles : undefined}
                        mode={line.mode}
                        kind={line.kind}
                      />
                    </section>
                  </TabCrossfade>
                )}

                {(lgUp || pane === 'timetable') && (
                  <TabCrossfade id="timetable" name={lgUp ? 'line-pane-timetable' : 'line-pane'}>
                    <section className={`glass rounded-2xl p-4 ${pane === 'timetable' ? '' : 'max-lg:hidden'}`}>
                      <h2 className="text-sm font-bold text-foreground">Rozkład</h2>
                      {/* Kapsuła kontekstu: stała pozycja, zmienia się tylko tekst. */}
                      <div
                        role="group"
                        aria-label="Wybrany rozkład"
                        className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-surface-border bg-surface-strong px-3 py-2 text-sm"
                      >
                        <LineBadge line={line.line} mode={line.mode} kind={line.kind} size="sm" />
                        <span aria-hidden="true" className="text-text-muted">
                          ·
                        </span>
                        <span className="min-w-0 font-semibold text-foreground [overflow-wrap:anywhere]">{headsign}</span>
                        {selectedStop !== undefined && (
                          <>
                            <span aria-hidden="true" className="text-text-muted">
                              ·
                            </span>
                            <span className="min-w-0 text-foreground [overflow-wrap:anywhere]">{stopDisplayName(selectedStop.name, selectedStop.code)}</span>
                          </>
                        )}
                      </div>
                      {selectedStop !== undefined && (
                        <Link
                          href={`/city/${city}/stop/${encodeStopIdForPathSegment(selectedStop.stopId)}?name=${encodeURIComponent(selectedStop.name)}`}
                          transitionTypes={NAV_FORWARD_TYPES}
                          className="mt-2 inline-flex items-center gap-0.5 text-sm font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-primary-text max-sm:min-h-11"
                        >
                          Odjazdy z przystanku
                          <ChevronRightIcon size={ICON_SIZE.inline} />
                        </Link>
                      )}
                      <LineTimetable
                        blocks={direction.departures}
                        offsetSec={selectedStop?.offsetSec ?? 0}
                        selectedBaseSec={selectedBaseSec}
                        onSelect={(sec) => setBase(sec === null ? null : { directionId: direction.directionId, sec })}
                      />
                    </section>
                  </TabCrossfade>
                )}

                {/* Mapa i pozycje pod listą trasy (nie w aside: aside schodzi pod treść poniżej `xl`); od `lg` na całą szerokość pod obiema sekcjami. */}
                <div className={`flex min-w-0 flex-col gap-4 lg:col-span-2 ${pane === 'route' ? '' : 'max-lg:hidden'}`}>
                  {stops.length >= 2 && (
                    <section ref={mapSectionRef} aria-labelledby={mapHeadingId} className="glass rounded-2xl p-3 sm:p-4">
                      <h2 id={mapHeadingId} className="mb-2 text-sm font-bold text-foreground">
                        Mapa trasy
                      </h2>
                      {mapNear ? (
                        <MapView
                          pins={mapPins}
                          route={mapRoute}
                          movers={mapMovers}
                          onPinClick={onMapPinClick}
                          ariaLabel={`Mapa trasy linii ${line.line}`}
                          dark={resolvedTheme === 'dark'}
                          compact={!lgUp}
                        />
                      ) : (
                        // Rezerwa wysokości = wysokość mapy, żeby wejście mapy nie przesuwało układu.
                        <div className={lgUp ? 'h-64' : 'h-44'} aria-hidden="true" />
                      )}
                    </section>
                  )}
                  <VehiclesRow city={city} routeId={routeId} directionId={direction.directionId} showVehicles={showVehicles} live={liveVehicles} />
                </div>
              </div>
            </>
          )}

          <div ref={alertsRef} tabIndex={-1} className="glass scroll-mt-20 rounded-2xl p-4 outline-none">
            <ContextAlerts alerts={alertList} state={alertsView.state} stale={alertsView.stale} scopeLabel={`Komunikaty linii ${line.line}`} />
          </div>
        </>
      )}

      {data !== null && <AttributionFooter attribution={data.attribution} />}
    </PageShell>
  )
}

const SKELETON_BLOCK = 'animate-pulse rounded bg-black/5 dark:bg-white/5'

/** Nazwa kierunku: pełny headsign; bez niego ostatni przystanek TEGO kierunku; bez przystanków „Kierunek nieznany" (origin nie jest celem). */
function directionName(direction: LineDetail['directions'][number]): string {
  const headsign = direction.headsign?.trim()
  if (headsign) return headsign
  return direction.stops.at(-1)?.name ?? 'Kierunek nieznany'
}

/**
 * Pojazdy kierunku: stan pozycji (osobny od przebiegu i rozkładu, #7) + wejście do mapy. Pozycje to GPS, nie ETA (#13).
 * Kierunek nieznany (2) nie odpytuje pozycji i nie podaje `dir` — nie podszywamy się pod kierunek 0.
 */
function VehiclesRow({ city, routeId, directionId, showVehicles, live }: { city: string; routeId: string; directionId: number; showVehicles: boolean; live: LineVehiclesState }) {
  const mapHref = `/city/${city}/map?line=${encodeURIComponent(routeId)}${showVehicles ? `&dir=${directionId}` : ''}`
  let status: ReactNode = null
  if (!showVehicles) {
    status = <p className="text-sm text-text-secondary">Kierunek nieznany — pokazujemy pojazdy bez rozróżnienia kierunku.</p>
  } else if ((live.error !== null || live.feed.state === 'failed') && live.vehicles.length === 0) {
    status = <p className="text-sm text-error-text">Nie udało się pobrać pozycji.</p>
  } else if (live.feed.state === 'loading') {
    status = <p className="text-sm text-text-secondary">Wczytywanie pozycji…</p>
  } else if (live.vehicles.length === 0) {
    status =
      live.feed.state === 'ready' ? (
        <p className="text-sm text-text-secondary">Brak pojazdów w tym kierunku.</p>
      ) : (
        <p className="text-sm text-text-secondary">Brak danych o pozycjach pojazdów</p>
      )
  } else {
    const newest = Math.min(...live.vehicles.map((v) => v.ageSec))
    status = (
      <>
        <p className="text-sm font-semibold text-foreground">{`Pojazdy w tym kierunku: ${live.vehicles.length}`}</p>
        <p className="text-xs text-text-secondary">{`GPS: ${formatAgo(newest)}`}</p>
      </>
    )
  }
  return (
    <section aria-label="Pojazdy linii" className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div className="min-w-0 flex-1">{status}</div>
      <Link href={mapHref} className="chip-filter shrink-0 gap-1.5">
        <MapIcon size={ICON_SIZE.button} />
        Pojazdy na mapie
      </Link>
    </section>
  )
}
