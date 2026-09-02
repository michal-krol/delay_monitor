'use client'

import { useEffect, useMemo, useState } from 'react'
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { CityPicker, type CityOption } from '@/components/CityPicker'
import { CitySummary, type CitySummaryData } from '@/components/CitySummary'
import { ModeFilterChips, type SearchMode } from '@/components/ModeFilterChips'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { FullBoard } from '@/components/FullBoard'
import { TransitStopDetail } from '@/components/TransitStopDetail'
import { ArrowLeftIcon } from '@/components/icons'
import { favouriteKey, useFavourites, type Favourite } from '@/hooks/useFavourites'
import { useCityContext } from '@/hooks/useCityContext'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

type CityEntry = CityOption & CitySummaryData & { name: string }

export default function CityPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const router = useRouter()
  const searchParams = useSearchParams()
  const { setCity } = useCityContext()
  const { isFavourite, addFavourite, removeFavourite } = useFavourites()

  const [cities, setCities] = useState<CityEntry[]>([])
  const [mode, setMode] = useState<SearchMode>('all')

  useEffect(() => {
    setCity(city)
  }, [city, setCity])

  useEffect(() => {
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityEntry[] }) => {
        if (!cancelled) setCities(body.cities)
      })
      .catch(() => {
        // Brak listy → picker pokazuje bieżące miasto, reszta ekranu działa.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const entry = useMemo(() => cities.find((option) => option.id === city) ?? null, [cities, city])
  const cityName = entry?.name ?? city

  // Wybrany przystanek — z parametru URL, wzajemnie wykluczające się.
  const rawRail = searchParams.get('stacja')
  const rawTransit = searchParams.get('przystanek')
  const selectedName = searchParams.get('nazwa') ?? undefined
  const railId = rawRail !== null && STATION_ID_PATTERN.test(rawRail) ? rawRail : null
  const transitId = rawTransit !== null && GTFS_STOP_ID_PATTERN.test(rawTransit) ? rawTransit : null
  const hasSelection = railId !== null || transitId !== null

  function pick(option: StationOption): void {
    const name = encodeURIComponent(option.name)
    if (option.kind === 'rail') {
      router.push(`/miasto/${city}?stacja=${encodeURIComponent(option.id)}&nazwa=${name}`)
    } else {
      router.push(`/miasto/${city}?przystanek=${encodeURIComponent(option.id)}&nazwa=${name}`)
    }
  }

  function clearSelection(): void {
    router.push(`/miasto/${city}`)
  }

  const railFavourite: Favourite | null =
    railId !== null ? { kind: 'pkp', id: railId, name: selectedName ?? railId } : null

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
      <TopBar title={`Odjazdy i przyjazdy — ${cityName}`} subtitle="Stacje kolejowe i przystanki komunikacji miejskiej" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CityPicker cities={cities} current={city} />
      </div>
      {entry !== null && !hasSelection && <CitySummary data={entry} />}

      <div className="flex flex-col gap-3">
        <ModeFilterChips value={mode} onChange={setMode} />
        <StationSearch
          wide
          endpoint={`/api/search?city=${encodeURIComponent(city)}&mode=${mode}`}
          placeholder="Szukaj stacji kolejowej lub przystanku miejskiego…"
          onSelect={pick}
        />
      </div>

      {hasSelection && (
        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-2 self-start text-sm font-semibold text-text-secondary hover:text-foreground"
          >
            <ArrowLeftIcon size={16} />
            Wróć do wyszukiwania
          </button>

          {railId !== null && railFavourite !== null && (
            <FullBoard
              embedded
              stationId={railId}
              stationName={railFavourite.name}
              isFavourite={isFavourite(favouriteKey(railFavourite))}
              onToggleFavourite={() =>
                isFavourite(favouriteKey(railFavourite))
                  ? removeFavourite(favouriteKey(railFavourite))
                  : addFavourite(railFavourite)
              }
              onClose={clearSelection}
            />
          )}

          {transitId !== null && <TransitStopDetail embedded city={city} stopId={transitId} />}
        </section>
      )}
    </main>
  )
}
