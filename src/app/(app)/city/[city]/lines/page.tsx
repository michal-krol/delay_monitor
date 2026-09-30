'use client'

import { useMemo, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import { useCities } from '@/hooks/useCities'
import { fetchJson, usePolling } from '@/hooks/usePolling'
import { useRecentLines } from '@/hooks/useRecentLines'
import { useSectionOpen } from '@/hooks/useSectionOpen'
import { TopBar } from '@/components/TopBar'
import { CityPicker } from '@/components/CityPicker'
import { LineGrid, LineResults, RecentLines } from '@/components/LineGrid'
import { SEARCH_INPUT_CLASS } from '@/components/StationSearch'
import { ScheduleStatus, scheduleNeedsAttention } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { CityWeatherCard } from '@/components/CityWeatherCard'
import { CityTransitWidget } from '@/components/CityTransitWidget'
import { MODE_ORDER } from '@/components/transitMode'
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

export default function CityLinesPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const { cities } = useCities()
  const [query, setQuery] = useState('')
  const { recent } = useRecentLines(city)
  const { isOpen, setOpen } = useSectionOpen()

  // Jedno pobranie z ponawianiem (drabinka `usePolling`, nigdy się nie poddaje), dopóki rozkład się wczytuje; po błędzie ponowienie co 30 s.
  const { data, error } = usePolling<LinesResponse>(city, () => fetchJson(`/api/gtfs/lines?city=${encodeURIComponent(city)}`), {
    refreshMs: null,
    // Brak listy = dalej ponawiamy (także po nieudanym pierwszym wczytaniu rozkładu: `state: 'failed'`, `lines: null`).
    isLoading: (json) => json.lines === null,
  })
  const failed = error !== null

  const cityName = useMemo(() => cities.find((option) => option.id === city)?.name ?? city, [cities, city])

  // Wszystkie linie w kolejności prezentacji (środek → numer) — do szukania i do „Ostatnio oglądane”.
  const allLines = useMemo(() => (data?.lines == null ? null : MODE_ORDER.flatMap((mode) => data.lines![mode])), [data])

  const needle = normalizeForSearch(query)
  const hits = useMemo(
    () =>
      allLines === null || needle.length === 0
        ? null
        : allLines.filter((entry) => normalizeForSearch(entry.line).includes(needle) || normalizeForSearch(entry.longName).includes(needle)),
    [allLines, needle]
  )

  return (
    <PageShell
      aside={
        <>
          <CityWeatherCard city={city} />
          <CityTransitWidget city={city} cityName={cityName} />
        </>
      }
    >
      <TopBar
        title={`Linie — ${cityName}`}
        subtitle="Metro, tramwaje, autobusy i kolej miejska"
        actions={<CityPicker cities={cities} current={city} hrefFor={(id) => `/city/${id}/lines`} />}
      />

      {/* Góra: tylko gdy coś jest nie tak (wczytywanie, wiek danych, błąd); zwykła linijka jest w stopce. */}
      {data !== null && scheduleNeedsAttention(data.schedule, failed) && (
        <ScheduleStatus schedule={data.schedule} cityName={cityName} error={failed} />
      )}

      {data === null ? (
        failed ? (
          <p className="text-sm text-error-text">Nie udało się pobrać listy linii.</p>
        ) : (
          <p className="text-sm text-text-secondary">Wczytywanie…</p>
        )
      ) : allLines === null ? (
        // Rozkład jeszcze się wczytuje (`lines: null`) — fazę pokazuje `ScheduleStatus` u góry.
        <p className="text-sm text-text-secondary">Wczytywanie…</p>
      ) : allLines.length === 0 ? (
        <p className="text-sm text-text-secondary">Feed nie zawiera linii.</p>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj: numer linii albo przystanek końcowy…"
            aria-label="Szukaj linii"
            className={SEARCH_INPUT_CLASS}
          />
          <RecentLines recent={recent} lines={allLines} city={city} />
          {hits !== null ? (
            <LineResults lines={hits} city={city} />
          ) : (
            <LineGrid linesByMode={data.lines!} city={city} isOpen={isOpen} onToggle={setOpen} />
          )}
        </>
      )}

      {data !== null && data.schedule.state !== 'loading' && (
        <footer data-testid="lines-footer">
          <ScheduleStatus schedule={data.schedule} cityName={cityName} quiet />
          <AttributionFooter attribution={data.attribution} />
        </footer>
      )}
    </PageShell>
  )
}
