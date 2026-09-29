'use client'

import { useMemo, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import { useCities } from '@/hooks/useCities'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import { TopBar } from '@/components/TopBar'
import { CityPicker } from '@/components/CityPicker'
import { ModeFilter, type ModeValue } from '@/components/ModeFilter'
import { LineGrid } from '@/components/LineGrid'
import { ScheduleStatus } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { CityWeatherCard } from '@/components/CityWeatherCard'
import { PageShell } from '@/components/aside'
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

const MODES: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']

export default function CityLinesPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const { cities } = useCities()
  const [mode, setMode] = useState<ModeValue>('all')
  const [query, setQuery] = useState('')

  // Jedno pobranie z ponawianiem (drabinka `usePolling`, nigdy się nie poddaje), dopóki rozkład się wczytuje; po błędzie ponowienie co 30 s.
  const { data, error } = usePolling<LinesResponse>(city, () => fetchJson(`/api/gtfs/lines?city=${encodeURIComponent(city)}`), {
    refreshMs: null,
    isLoading: (json) => json.schedule.state === 'loading',
  })
  const failed = error !== null

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
    <PageShell aside={<CityWeatherCard city={city} />}>
      <TopBar
        title={`Trasy — ${cityName}`}
        subtitle="Przeglądarka linii komunikacji miejskiej"
        actions={<CityPicker cities={cities} current={city} hrefFor={(id) => `/city/${id}/lines`} />}
      />

      {data !== null && <ScheduleStatus schedule={data.schedule} cityName={cityName} error={failed} />}

      {failed && data === null ? (
        <p className="text-sm text-error-text">Nie udało się pobrać listy linii.</p>
      ) : loading ? (
        <p className="text-sm text-text-secondary">Wczytywanie linii…</p>
      ) : filteredLines === null ? (
        <p className="text-sm text-text-secondary">Wczytywanie rozkładu…</p>
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
    </PageShell>
  )
}
