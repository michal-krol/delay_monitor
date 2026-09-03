'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { LineBadge } from '@/components/LineBadge'
import { LineTimetable } from '@/components/LineTimetable'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { AsideCard } from '@/components/aside'
import { WeatherCard } from '@/components/StationAside'
import { AccessibleIcon, ArrowRightIcon, SwapIcon } from '@/components/icons'
import { MODE_LABEL } from '@/components/transitMode'
import { pluralPl } from '@/lib/plural'
import { useStationWeather } from '@/hooks/useStationWeather'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import type { LineDetail } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'

type LineResponse = {
  city: string
  schedule: TransitBoardResponse['schedule']
  line: LineDetail | null
  attribution: string[]
}
type CityEntry = { id: string; name: string; railStations: { id: string; name: string }[] }

const LOADING_RETRY_MS = [1000, 2000, 3000, 5000, 8000, 15000]
const KIND_LABEL = { regular: '', night: 'linia nocna', express: 'linia przyspieszona', replacement: 'linia zastępcza' } as const

const clock = (sec: number) =>
  `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`

export default function LineDetailPage() {
  const params = useParams<{ city: string; routeId: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const routeId = typeof params.routeId === 'string' ? params.routeId : ''

  if (!CITY_ID_PATTERN.test(city) || !GTFS_ROUTE_ID_PATTERN.test(routeId)) {
    notFound()
  }

  const router = useRouter()
  const [data, setData] = useState<LineResponse | null>(null)
  const [cities, setCities] = useState<CityEntry[]>([])
  const [failed, setFailed] = useState(false)
  const [dirIdx, setDirIdx] = useState(0)
  const [stopSel, setStopSel] = useState(0)
  const [selectedBaseSec, setSelectedBaseSec] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityEntry[] }) => {
        if (!cancelled) setCities(body.cities)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let retry = 0

    function tick(): void {
      fetch(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((json: LineResponse) => {
          if (cancelled) return
          setData(json)
          setFailed(false)
          if (json.line === null && json.schedule.state === 'loading' && retry < LOADING_RETRY_MS.length) {
            timer = setTimeout(tick, LOADING_RETRY_MS[retry++])
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
  }, [city, routeId])

  const entry = useMemo(() => cities.find((option) => option.id === city) ?? null, [cities, city])
  const cityName = entry?.name ?? city
  // ponytail: pogoda linii ≈ pogoda głównej stacji kolejowej miasta; osobny
  // endpoint po lat/lon przystanku, gdyby to okazało się za grube przybliżenie.
  const railStationId = entry?.railStations?.[0]?.id ?? ''
  const weather = useStationWeather(railStationId)

  const line = data?.line ?? null
  const loading = data === null && !failed
  const directions = line?.directions ?? []
  const direction = directions[Math.min(dirIdx, Math.max(0, directions.length - 1))]
  const stops = direction?.stops ?? []
  const selectedStop = stops[Math.min(stopSel, Math.max(0, stops.length - 1))]

  function switchDirection(): void {
    setDirIdx((i) => (i + 1) % Math.max(1, directions.length))
    setStopSel(0)
    setSelectedBaseSec(null)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0 xl:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
        <TopBar backLabel="Wróć do linii" onBack={() => router.push(`/miasto/${city}/linie`)} />

        {line !== null && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <LineBadge line={line.line} color={line.color} mode={line.mode} />
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{line.longName}</h1>
            </div>
            <p className="text-sm text-text-secondary">
              {MODE_LABEL[line.mode]}
              {KIND_LABEL[line.kind] !== '' && <span className="text-text-muted"> · {KIND_LABEL[line.kind]}</span>}
            </p>
            {data !== null && (
              <ScheduleStatus schedule={data.schedule} cityName={cityName} title={`Rozkład jazdy linii ${line.line}`} error={failed} />
            )}
          </div>
        )}

        {failed && data === null ? (
          <p className="text-sm text-red-700 dark:text-red-300">Nie udało się pobrać przebiegu linii.</p>
        ) : loading ? (
          <p className="text-sm text-text-secondary">Wczytuję przebieg linii…</p>
        ) : line === null || direction === undefined ? (
          <p className="text-sm text-text-secondary">
            {data?.schedule.state === 'loading' ? 'Rozkład jeszcze się wczytuje.' : 'Nie znaleziono takiej linii w rozkładzie.'}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={switchDirection}
              disabled={directions.length < 2}
              aria-label="Zmień kierunek"
              className="inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold text-foreground transition enabled:hover:bg-black/5 disabled:opacity-60 dark:enabled:hover:bg-white/10"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <span>{direction.origin ?? stops[0]?.name}</span>
              <ArrowRightIcon size={13} className="text-text-muted" />
              <span>{direction.headsign ?? stops.at(-1)?.name ?? `Kierunek ${direction.directionId + 1}`}</span>
              {directions.length >= 2 && <SwapIcon size={15} className="ml-1 text-indigo-600 dark:text-indigo-400" />}
            </button>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
              <section className="glass rounded-2xl p-4">
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
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                              active ? 'border-indigo-500 bg-indigo-500' : 'border-[var(--surface-border)]'
                            }`}
                            style={!active && (first || last) ? { background: 'var(--foreground)' } : undefined}
                            aria-hidden="true"
                          />
                          {!last && <span className="mt-1 w-0.5 flex-1" style={{ background: 'var(--surface-border)' }} aria-hidden="true" />}
                        </div>
                        <button
                          type="button"
                          onClick={() => setStopSel(index)}
                          aria-pressed={active}
                          className={`mb-2 flex flex-1 items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm transition ${
                            active ? 'bg-black/5 font-semibold text-foreground dark:bg-white/10' : 'text-text-secondary hover:text-foreground'
                          }`}
                        >
                          <span className={`min-w-0 flex-1 ${first || last ? 'font-semibold text-foreground' : ''}`}>
                            {stop.name}
                            {(first || last) && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] text-text-muted">
                                {first ? 'początek' : 'koniec'}
                              </span>
                            )}
                          </span>
                          {stop.wheelchair === 1 && <AccessibleIcon size={13} className="shrink-0 self-center text-text-muted" />}
                          {passSec !== null ? (
                            <span className="shrink-0 font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{clock(passSec)}</span>
                          ) : (
                            index > 0 && <span className="shrink-0 text-xs tabular-nums text-text-muted">+{Math.round(stop.offsetSec / 60)} min</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>

              <section className="glass rounded-2xl p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold text-foreground">Rozkład — {selectedStop?.name}</h2>
                  {selectedStop !== undefined && (
                    <Link
                      href={`/miasto/${city}/przystanek/${encodeURIComponent(selectedStop.groupId)}?nazwa=${encodeURIComponent(selectedStop.name)}`}
                      className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      pełna tablica przystanku →
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
      </main>

      {line !== null && direction !== undefined && (
        <aside className="flex shrink-0 flex-col gap-4 px-4 pb-6 sm:px-8 xl:w-72 xl:self-start xl:px-0 xl:pr-8 xl:pt-24">
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
                    {clock(direction.departures[0].times[0])}–{clock(direction.departures[0].times.at(-1)!)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </AsideCard>

          <AsideCard title={`Pogoda dziś — ${cityName}`}>
            <WeatherCard weather={weather} />
          </AsideCard>
        </aside>
      )}
    </div>
  )
}
