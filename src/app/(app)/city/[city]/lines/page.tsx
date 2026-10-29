'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { notFound, useParams, useSearchParams } from 'next/navigation'
import { useCities } from '@/hooks/useCities'
import { useCityLines } from '@/hooks/useCityLines'
import { useRecentLines } from '@/hooks/useRecentLines'
import { useSectionOpen } from '@/hooks/useSectionOpen'
import { TopBar } from '@/components/TopBar'
import { CityPicker } from '@/components/CityPicker'
import { CloseIcon, ICON_SIZE, SearchIcon } from '@/components/icons'
import { HOVER } from '@/components/interaction'
import { LineGrid, LineResults, RecentLines } from '@/components/LineGrid'
import { SEARCH_INPUT_CLASS } from '@/components/StationSearch'
import { ScheduleStatus, scheduleNeedsAttention } from '@/components/ScheduleStatus'
import { AttributionFooter } from '@/components/AttributionFooter'
import { CityTransitWidget } from '@/components/CityTransitWidget'
import { TabCrossfade } from '@/components/TabCrossfade'
import { PageShell } from '@/components/aside'
import { filterCatalogLines, groupByMode, linesViewPatch, MAX_LINES_QUERY, parseLinesView, type LinesView } from '@/lib/linesView'
import { pluralPl } from '@/lib/plural'
import { patchUrlParams } from '@/lib/urlState'
import { CITY_ID_PATTERN } from '@/lib/validation'

const FALLBACK_SUBTITLE = 'Metro, tramwaje, autobusy i kolej miejska'

const SEARCH_FIELD_CLASS = `${SEARCH_INPUT_CLASS} min-h-11 pl-10 focus:ring-primary-text! [&::-webkit-search-cancel-button]:appearance-none`

// `useSearchParams()` wymaga granicy <Suspense> przy prerenderze statycznym (jak w `/search`); fallback trafia do HTML-a,
// więc to ten sam szkielet co po hydracji — nie pusty ekran (#7).
export default function CityLinesPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  return (
    <Suspense
      fallback={
        <PageShell>
          <TopBar title="Linie" subtitle={FALLBACK_SUBTITLE} />
          <LinesSkeleton />
        </PageShell>
      }
    >
      <CityLinesRoute city={city} />
    </Suspense>
  )
}

/** Adres czytamy raz, przy montowaniu: potem stan trzyma komponent, a adres tylko za nim podąża (`replaceState`). */
function CityLinesRoute({ city }: { city: string }) {
  const searchParams = useSearchParams()
  return <LinesCatalog key={city} city={city} initial={parseLinesView(searchParams)} />
}

function LinesSkeleton() {
  return (
    <div aria-busy="true" data-testid="lines-skeleton" className="flex flex-col gap-2.5">
      <span className="sr-only">Wczytywanie…</span>
      <div aria-hidden="true" className="h-11 animate-pulse rounded-xl bg-black/5 dark:bg-white/5" />
      {[0, 1, 2].map((index) => (
        <div key={index} aria-hidden="true" className="h-14 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
      ))}
    </div>
  )
}

function LinesCatalog({ city, initial }: { city: string; initial: LinesView }) {
  const { cities } = useCities()
  const { recent } = useRecentLines(city)
  const { isOpen, setOpen } = useSectionOpen()
  const { lines, state, error, refresh, schedule, attribution } = useCityLines(city)
  const [q, setQ] = useState(initial.q)
  useEffect(() => { patchUrlParams({ mode: null }) }, [])
  const inputRef = useRef<HTMLInputElement>(null)

  // Ostrzeżenie (wczytywanie, wiek danych, błąd) idzie na górę; wtedy stopka NIE powtarza bloku stanu rozkładu.
  const attention = schedule !== null && scheduleNeedsAttention(schedule, error)
  const cityName = useMemo(() => cities.find((option) => option.id === city)?.name ?? city, [cities, city])

  const shown = useMemo(() => (lines === null ? [] : filterCatalogLines(lines, { q })), [lines, q])
  const grouped = useMemo(() => groupByMode(shown), [shown])

  function changeQuery(next: string): void {
    setQ(next)
    patchUrlParams({ q: next === '' ? null : next })
  }

  function clearFilters(): void {
    setQ('')
    patchUrlParams(linesViewPatch({ q: '' }))
    // Przycisk „Wyczyść filtry” znika po kliknięciu — fokus wraca do pola, nie do `<body>`.
    inputRef.current?.focus()
  }

  return (
    <PageShell aside={<CityTransitWidget city={city} cityName={cityName} />}>
      <TopBar
        city={city}
        title="Linie"
        subtitle={cityName}
        actions={<CityPicker cities={cities} current={city} hrefFor={(id) => `/city/${id}/lines`} />}
      />

      {/* Góra: tylko gdy coś jest nie tak (wczytywanie, wiek danych, błąd); zwykła linijka jest w stopce. */}
      {schedule !== null && attention && <ScheduleStatus schedule={schedule} cityName={cityName} error={error} />}

      {lines === null ? (
        state === 'failed' ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-error-text">Nie udało się pobrać listy linii.</p>
            <button type="button" onClick={refresh} className="btn-primary">
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          // Wczytywanie rozkładu (`lines: null`) — fazę pokazuje `ScheduleStatus` u góry.
          <LinesSkeleton />
        )
      ) : lines.length === 0 ? (
        <p className="text-sm text-text-secondary">Brak linii w rozkładzie.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <form role="search" onSubmit={(event) => event.preventDefault()} className="relative">
            <SearchIcon size={ICON_SIZE.button} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              maxLength={MAX_LINES_QUERY}
              value={q}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Numer linii lub przystanek końcowy"
              aria-label="Numer linii lub przystanek końcowy"
              className={`${SEARCH_FIELD_CLASS} ${q === '' ? 'pr-3' : 'pr-12'}`}
            />
            {q !== '' && (
              <button
                type="button"
                aria-label="Wyczyść wyszukiwanie"
                onClick={() => {
                  changeQuery('')
                  inputRef.current?.focus()
                }}
                className={`control-44 absolute top-1/2 right-0.5 flex -translate-y-1/2 items-center justify-center rounded-lg text-text-secondary transition ${HOVER} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text`}
              >
                <CloseIcon size={ICON_SIZE.button} />
              </button>
            )}
          </form>
          {/* Wynik zmienia się przy pisaniu, a panel jest podmieniany w całości — liczbę ogłasza ten węzeł (bez wiekowych komunikatów listy). */}
          <p role="status" className="sr-only">
            {q.trim() === '' ? '' : `Znaleziono: ${shown.length} ${pluralPl(shown.length, 'linia', 'linie', 'linii')}`}
          </p>
          <RecentLines recent={recent} lines={lines} city={city} />
          <TabCrossfade id="all" name="lines-catalog">
            {q.trim() !== '' ? (
              <LineResults lines={shown} city={city} onClear={clearFilters} />
            ) : (
              <LineGrid linesByMode={grouped} city={city} isOpen={isOpen} onToggle={setOpen} />
            )}
          </TabCrossfade>
        </div>
      )}

      {schedule !== null && schedule.state !== 'loading' && (
        <footer data-testid="lines-footer">
          {!attention && <ScheduleStatus schedule={schedule} cityName={cityName} quiet />}
          <AttributionFooter attribution={attribution} />
        </footer>
      )}
    </PageShell>
  )
}
