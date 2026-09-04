'use client'

import { useEffect, useMemo, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { CityPicker, type CityOption } from '@/components/CityPicker'
import { ModeFilter, type ModeValue } from '@/components/ModeFilter'
import { LineGrid } from '@/components/LineGrid'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { CityWeatherCard } from '@/components/CityWeatherCard'
import { normalizeForSearch } from '@/lib/search'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN } from '@/lib/validation'

type LinesResponse = {
  city: string
  schedule: TransitBoardResponse['schedule']
  lines: Record<GtfsMode, LineListEntry[]> | null
  attribution: string[]
}

const LOADING_RETRY_MS = [1000, 2000, 3000, 5000, 8000, 15000]
const MODES: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']

export default function CityLinesPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const [data, setData] = useState<LinesResponse | null>(null)
  const [cities, setCities] = useState<CityOption[]>([])
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<ModeValue>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityOption[] }) => {
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
      fetch(`/api/gtfs/lines?city=${encodeURIComponent(city)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((json: LinesResponse) => {
          if (cancelled) return
          setData(json)
          setFailed(false)
          if (json.schedule.state === 'loading' && retry < LOADING_RETRY_MS.length) {
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
  }, [city])

  const cityName = useMemo(() => cities.find((option) => option.id === city)?.name ?? city, [cities, city])

  const filteredLines = useMemo(() => {
    if (data?.lines == null) return null
    const needle = normalizeForSearch(query)
    if (needle.length === 0) return data.lines
    const match = (entry: LineListEntry) =>
      normalizeForSearch(entry.line).includes(needle) || normalizeForSearch(entry.longName).includes(needle)
    return Object.fromEntries(MODES.map((m) => [m, data.lines![m].filter(match)])) as Record<GtfsMode, LineListEntry[]>
  }, [data, query])

  const available = useMemo<GtfsMode[]>(
    () => (data?.lines == null ? [] : MODES.filter((m) => data.lines![m].length > 0)),
    [data]
  )
  const loading = data === null && !failed

  return (
    <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
      <TopBar
        title={`Trasy — ${cityName}`}
        subtitle="Przeglądarka linii komunikacji miejskiej"
        actions={<CityPicker cities={cities} current={city} hrefFor={(id) => `/miasto/${id}/linie`} />}
      />

      {data !== null && <ScheduleStatus schedule={data.schedule} cityName={cityName} error={failed} />}

      {failed && data === null ? (
        <p className="text-sm text-red-700 dark:text-red-300">Nie udało się pobrać listy linii.</p>
      ) : loading ? (
        <p className="text-sm text-text-secondary">Wczytuję linie…</p>
      ) : filteredLines === null ? (
        <p className="text-sm text-text-secondary">Rozkład jeszcze się wczytuje.</p>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj linii (numer lub kierunek)…"
            aria-label="Szukaj linii"
            className="glass w-full max-w-md rounded-xl px-3.5 py-2.5 text-foreground placeholder:text-text-muted outline-none transition focus:ring-2 focus:ring-indigo-500"
          />
          <ModeFilter available={available} value={mode} onChange={setMode} />
          <LineGrid linesByMode={filteredLines} city={city} filter={mode} />
        </>
      )}

      {data !== null && <AttributionFooter attribution={data.attribution} />}
    </main>

      <aside className="shrink-0 px-4 pb-6 sm:px-8 xl:w-72 xl:self-start xl:px-0 xl:pr-8 xl:pt-24">
        <CityWeatherCard city={city} />
      </aside>
    </div>
  )
}
