'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { notFound, useParams } from 'next/navigation'
import { PageTitle } from '@/components/PageTitle'
import { TopBar } from '@/components/TopBar'
import { AlertBanner } from '@/components/AlertBanner'
import { LineBadge } from '@/components/LineBadge'
import { OnRequestBadge } from '@/components/OnRequestBadge'
import { LineTimetable } from '@/components/LineTimetable'
import { MapView, type MapMover, type MapPin } from '@/components/MapView'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { stopDisplayName } from '@/components/stopName'
import { AttributionFooter } from '@/components/AttributionFooter'
import { AsideCard, PageShell } from '@/components/aside'
import { AccessibleIcon, ArrowRightIcon, ChevronRightIcon, SwapIcon, VehicleHeadingIcon, ICON_SIZE } from '@/components/icons'
import { LINE_KIND_LABEL, MODE_LABEL, darkRingClass, lineColor } from '@/components/transitMode'
import { pluralPl } from '@/lib/plural'
import { formatSecondsOfDay } from '@/lib/format'
import { useCities } from '@/hooks/useCities'
import { isLineLoading } from '@/hooks/useLineDetail'
import { useLineVehicles } from '@/hooks/useLineVehicles'
import { useRecentLines } from '@/hooks/useRecentLines'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import { hasCustomStroke, strokeFor } from '@/components/map/mapData'
import type { LineDetail } from '@/lib/gtfs/query'
import type { LineKind } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN, encodeStopIdForPathSegment } from '@/lib/validation'

type LineResponse = {
  city: string
  schedule: TransitBoardResponse['schedule']
  line: LineDetail | null
  /** `null` = feed alertów jeszcze nie odpowiedział (nieznane); `isLineLoading` ponawia do skutku. */
  alerts: import('@/lib/gtfs/alerts').AlertRecord[] | null
  attribution: string[]
}

// Stała referencja: `stops` wchodzi do zależności `useMemo` mapy.
const NO_STOPS: LineDetail['directions'][number]['stops'] = []

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

  const { cities } = useCities()
  const [dirIdx, setDirIdx] = useState(0)
  const [stopSel, setStopSel] = useState(0)
  /** Poniżej `lg` jedna sekcja naraz (trasa albo rozkład); od `lg` obie obok siebie i stan nic nie zmienia. */
  const [pane, setPane] = useState<'route' | 'timetable'>('route')
  const paneSwitchRef = useRef<HTMLDivElement>(null)
  const [selectedBaseSec, setSelectedBaseSec] = useState<number | null>(null)

  // Jedno pobranie z ponawianiem (drabinka `usePolling`, nigdy się nie poddaje), dopóki rozkład się wczytuje; po błędzie ponowienie co 30 s.
  const { data, error } = usePolling<LineResponse>(
    `${city}:${routeId}`,
    () => fetchJson(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId)}`),
    { refreshMs: null, isLoading: isLineLoading }
  )
  const failed = error !== null

  const entry = useMemo(() => cities.find((option) => option.id === city) ?? null, [cities, city])
  const cityName = entry?.name ?? city

  const line = data?.line ?? null

  // „Ostatnio oglądane": zapis dopiero, gdy linia się wczytała (nigdy dla nieznanego id)
  // i tylko raz na trasę — nie przy każdym odświeżeniu danych.
  const { record: recordRecent } = useRecentLines(city)
  const recordedRef = useRef<string | null>(null)
  const lineKnown = line !== null
  useEffect(() => {
    const key = `${city}:${routeId}`
    if (!lineKnown || recordedRef.current === key) return
    recordedRef.current = key
    recordRecent(routeId)
  }, [lineKnown, city, routeId, recordRecent])

  const loading = data === null && !failed
  const directions = line?.directions ?? []
  const direction = directions[Math.min(dirIdx, Math.max(0, directions.length - 1))]
  const stops = direction?.stops ?? NO_STOPS
  const selectedStop = stops[Math.min(stopSel, Math.max(0, stops.length - 1))]

  // Endpoint pozycji przyjmuje wyłącznie kierunek 0/1; przebieg bywa oznaczony
  // `2` (nieznany) — wtedy hook nie pyta i nie renderujemy markerów ani karty.
  const vehicleDir = direction?.directionId === 1 ? 1 : 0
  const showVehicles = direction !== undefined && (direction.directionId === 0 || direction.directionId === 1)
  const liveVehicles = useLineVehicles(city, routeId, showVehicles ? vehicleDir : 2)

  // Mapa linii: piny = przystanki przebiegu (id = indeks, bo ten sam przystanek może wystąpić
  // dwa razy), pojazdy z tego samego pollingu co karta „Pojazdy w trasie" -- zero nowych zapytań.
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
  // Paleta linii liczona raz (oś czasu: kropki pojazdów). Czerń/granat (nocna/lokalna) giną na ciemnej karcie — jasny pierścień zamiast pierścienia w kolorze tła (ta sama reguła co plakietki, `darkRingClass`).
  const palette = lineColor(line?.mode ?? 'bus', mapKind)
  const dotDarkRing = darkRingClass(mapKind) !== '' ? 'dark:ring-white/40' : 'dark:ring-slate-900'
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
  const onMapPinClick = useCallback((id: string) => setStopSel(Number(id)), [])

  function switchDirection(): void {
    setDirIdx((i) => (i + 1) % Math.max(1, directions.length))
    setStopSel(0)
    setSelectedBaseSec(null)
  }

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

      {showVehicles && direction !== undefined && (
        <AsideCard title={`Pojazdy w trasie${direction.headsign ? ` — ${direction.headsign}` : ''}`}>
          {liveVehicles.error !== null && liveVehicles.vehicles.length === 0 ? (
            <p className="text-xs text-error-text">Nie udało się pobrać pozycji.</p>
          ) : liveVehicles.feed.state === 'loading' ? (
            <p className="text-xs text-text-muted">Wczytywanie pozycji…</p>
          ) : liveVehicles.vehicles.length === 0 ? (
            <p className="text-xs text-text-muted">Brak pojazdów w trasie w tym kierunku.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs">
              {liveVehicles.vehicles
                .slice()
                .sort((a, b) => a.afterStopOrder - b.afterStopOrder)
                .map((v) => (
                  <li key={v.sideNumber + v.tripId} className="flex justify-between gap-2">
                    <span className="text-foreground">#{v.sideNumber}</span>
                    <span className="text-text-muted">
                      za „{afterStopName(stops, v.afterStopOrder)}”
                      {v.ageSec > 60 && ` · ${Math.round(v.ageSec / 60)} min temu`}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </AsideCard>
      )}
    </>
  )

  return (
    <PageShell aside={asideContent}>
      <TopBar
        city={city}
        backLabel="Wróć do linii"
        backHref={`/city/${city}/lines`}
        crumbs={[
          { label: 'Linie', href: `/city/${city}/lines` },
          { label: line?.longName ?? routeId },
        ]}
      />

        {line !== null && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <LineBadge line={line.line} mode={line.mode} kind={line.kind} />
              <PageTitle>{line.longName}</PageTitle>
            </div>
            <p className="text-sm text-text-secondary">
              {MODE_LABEL[line.mode]}
              {LINE_KIND_LABEL[line.kind] !== '' && <span className="text-text-muted"> · linia {LINE_KIND_LABEL[line.kind]}</span>}
            </p>
            {data?.alerts != null && data.alerts.length > 0 && <AlertBanner alerts={data.alerts} />}
            {data !== null && (
              <ScheduleStatus schedule={data.schedule} cityName={cityName} title={`Rozkład jazdy linii ${line.line}`} error={failed} />
            )}
          </div>
        )}

        {failed && data === null ? (
          <p className="text-sm text-error-text">Nie udało się pobrać przebiegu linii.</p>
        ) : loading ? (
          <p className="text-sm text-text-secondary">Wczytywanie przebiegu linii…</p>
        ) : line === null || direction === undefined ? (
          <p className="text-sm text-text-secondary">
            {data?.schedule.state === 'loading' ? 'Wczytywanie rozkładu…' : 'Nie znaleziono takiej linii w rozkładzie.'}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={switchDirection}
              disabled={directions.length < 2}
              className="press inline-flex w-fit items-center gap-2 rounded-full border border-surface-border px-3.5 py-1.5 text-sm font-semibold text-foreground transition max-sm:min-h-11 enabled:hover:bg-black/5 disabled:opacity-60 dark:enabled:hover:bg-white/10"
            >
              {/* Spacje tekstowe: w flexie nie zmieniają układu, a nazwa dostępna nie skleja się w „CentrumdoDworzec”. */}
              <span>{direction.origin ?? stops[0]?.name}</span>{' '}
              <ArrowRightIcon size={ICON_SIZE.chip} label="do" className="text-text-muted" />{' '}
              <span>{direction.headsign ?? stops.at(-1)?.name ?? `Kierunek ${direction.directionId + 1}`}</span>{' '}
              {directions.length >= 2 && <SwapIcon size={ICON_SIZE.button} label="zmień kierunek" className="ml-1 text-indigo-600 dark:text-indigo-400" />}
            </button>

            {/* W treści głównej, nie w aside: aside schodzi pod treść poniżej `xl`, a mapa ma być tuż pod nagłówkiem trasy, także na telefonie. */}
            {stops.length >= 2 && (
              <section className="glass rounded-2xl p-4">
                <h2 className="mb-3 text-sm font-bold text-foreground">Mapa trasy</h2>
                <MapView
                  pins={mapPins}
                  route={mapRoute}
                  movers={mapMovers}
                  onPinClick={onMapPinClick}
                  ariaLabel={`Mapa trasy linii ${line.line}`}
                  dark={resolvedTheme === 'dark'}
                />
              </section>
            )}

            <div ref={paneSwitchRef} role="group" aria-label="Widok linii" className="glass flex w-max gap-1 rounded-full p-1 lg:hidden">
              {(['route', 'timetable'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={pane === key}
                  onClick={() => setPane(key)}
                  className={`min-h-11 rounded-full px-5 text-sm font-medium transition ${pane === key ? 'text-white shadow-sm' : 'text-text-secondary hover:text-foreground'}`}
                  style={pane === key ? { background: 'var(--accent-gradient)' } : undefined}
                >
                  {key === 'route' ? 'Trasa' : 'Rozkład'}
                </button>
              ))}
            </div>

            <div className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
              <section className={`glass rounded-2xl p-4 ${pane === 'route' ? '' : 'max-lg:hidden'}`}>
                <h2 className="text-sm font-bold text-foreground">
                  Trasa linii · {stops.length} {pluralPl(stops.length, 'przystanek', 'przystanki', 'przystanków')}
                </h2>
                <ol className="mt-3">
                  {stops.map((stop, index) => {
                    const active = index === stopSel
                    const first = index === 0
                    const last = index === stops.length - 1
                    const passSec = selectedBaseSec !== null ? selectedBaseSec + stop.offsetSec : null
                    return (
                      <li key={`${stop.stopId}-${index}`} className="flex gap-3">
                        <div className="flex flex-col items-center pt-1.5">
                          {first || last ? (
                            <span
                              className="h-2.5 w-2.5 shrink-0"
                              style={{ background: active ? 'var(--accent-solid)' : 'var(--foreground)' }}
                              aria-hidden="true"
                            />
                          ) : stop.onRequest ? (
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-transparent"
                              style={{ borderColor: active ? 'var(--accent-solid)' : 'var(--foreground)' }}
                              aria-hidden="true"
                            />
                          ) : (
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: active ? 'var(--accent-solid)' : 'var(--foreground)' }}
                              aria-hidden="true"
                            />
                          )}
                          {!last && (
                            <span className="relative mt-1 w-0.5 flex-1 bg-surface-border">
                              {showVehicles &&
                                liveVehicles.vehicles
                                  .filter((v) => v.afterStopOrder === index)
                                  .map((v) => (
                                    <span
                                      key={v.sideNumber + v.tripId}
                                      title={`Pojazd ${v.sideNumber}${v.ageSec > 60 ? ` · ${Math.round(v.ageSec / 60)} min temu` : ''}`}
                                      data-testid="timeline-vehicle"
                                      className={`absolute -left-[7px] grid h-4 w-4 place-items-center rounded-full text-white shadow ring-2 ring-white ${dotDarkRing}`}
                                      style={{
                                        top: `${v.fraction * 100}%`,
                                        // Kolor rodzaju jak na mapie; strzałka = kierunek jazdy NA OSI (w dół
                                        // listy), nie `v.bearing` — geograficzny azymut na pionowej,
                                        // schematycznej osi nie wskazuje niczego sensownego (ten idzie na mapę).
                                        backgroundColor: palette.bg,
                                        color: palette.fg,
                                        transform: 'translateY(-50%)',
                                        // Żółte metro na białym pierścieniu jasnej karty znika — pierścień w kolorze obrysu z mapy.
                                        ...(hasCustomStroke(palette.bg) ? ({ '--tw-ring-color': strokeFor(palette.bg) } as CSSProperties) : {}),
                                      }}
                                    >
                                      <VehicleHeadingIcon className="h-2.5 w-2.5 rotate-180" />
                                      <span className="sr-only">
                                        Pojazd {v.sideNumber}
                                        {v.ageSec > 60 ? `, ${Math.round(v.ageSec / 60)} min temu` : ''}
                                      </span>
                                    </span>
                                  ))}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setStopSel(index)
                            // Telefon: przystanek wybiera się po to, żeby zobaczyć jego rozkład.
                            if (pane !== 'timetable') {
                              setPane('timetable')
                              paneSwitchRef.current?.scrollIntoView({ block: 'nearest' })
                            }
                          }}
                          aria-pressed={active}
                          className={`press mb-2 flex flex-1 items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm transition max-sm:min-h-11 max-sm:items-center ${
                            active ? 'bg-black/5 font-semibold text-foreground dark:bg-white/10' : 'text-text-secondary hover:text-foreground'
                          }`}
                        >
                          <span className={`min-w-0 flex-1 ${first || last ? 'font-semibold text-foreground' : ''}`}>
                            {stopDisplayName(stop.name, stop.code)}
                            {stop.onRequest && (
                              <span className="ml-1.5 inline-block align-middle">
                                <OnRequestBadge />
                              </span>
                            )}
                            {(first || last) && (
                              <span className="ml-1.5 text-xs uppercase tracking-[0.08em] text-text-muted">
                                {first ? 'początek' : 'koniec'}
                              </span>
                            )}
                            {stop.street !== null && (
                              <span className="ml-2 text-xs text-text-muted">{stop.street}</span>
                            )}
                          </span>
                          {stop.wheelchair === 2 && (
                            <AccessibleIcon
                              size={ICON_SIZE.chip}
                              className="shrink-0 self-center text-warning-text"
                              label="Przystanek niedostępny dla osób na wózku"
                            />
                          )}
                          {passSec !== null ? (
                            <span className="shrink-0 font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{formatSecondsOfDay(passSec)}</span>
                          ) : (
                            index > 0 && <span className="shrink-0 text-xs tabular-nums text-text-muted">+{Math.round(stop.offsetSec / 60)} min</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ol>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--foreground)' }} aria-hidden="true" /> przystanek</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 bg-transparent" style={{ borderColor: 'var(--foreground)' }} aria-hidden="true" /> na żądanie</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2" style={{ background: 'var(--foreground)' }} aria-hidden="true" /> przystanek krańcowy</span>
                </div>
              </section>

              <section className={`glass rounded-2xl p-4 ${pane === 'timetable' ? '' : 'max-lg:hidden'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold text-foreground">Rozkład — {selectedStop !== undefined ? stopDisplayName(selectedStop.name, selectedStop.code) : ''}</h2>
                  {selectedStop !== undefined && (
                    <Link
                      href={`/city/${city}/stop/${encodeStopIdForPathSegment(selectedStop.stopId)}?name=${encodeURIComponent(selectedStop.name)}`}
                      className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      pełna tablica przystanku
                      <ChevronRightIcon size={ICON_SIZE.inline} className="ml-0.5 inline align-[-2px]" />
                    </Link>
                  )}
                </div>
                <LineTimetable
                  blocks={direction.departures}
                  offsetSec={selectedStop?.offsetSec ?? 0}
                  selectedBaseSec={selectedBaseSec}
                  onSelect={setSelectedBaseSec}
                />
              </section>
            </div>
          </>
        )}

        {data !== null && <AttributionFooter attribution={data.attribution} />}
    </PageShell>
  )
}
