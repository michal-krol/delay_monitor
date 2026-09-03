'use client'

import { useEffect, useMemo, useState } from 'react'
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { CityPicker, type CityOption } from '@/components/CityPicker'
import { CityStatTiles } from '@/components/CityStatTiles'
import { CityTransitWidget } from '@/components/CityTransitWidget'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { FullBoard } from '@/components/FullBoard'
import { TransitStopDetail } from '@/components/TransitStopDetail'
import { CityWeatherCard } from '@/components/CityWeatherCard'
import { ArrowLeftIcon } from '@/components/icons'
import { favouriteKey, useFavourites, type Favourite } from '@/hooks/useFavourites'
import { useCityContext } from '@/hooks/useCityContext'
import { useCityStats } from '@/hooks/useCityStats'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

type CityEntry = CityOption & { name: string }

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
  const { data: statsData } = useCityStats(city)

  const [cities, setCities] = useState<CityEntry[]>([])

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
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const entry = useMemo(() => cities.find((option) => option.id === city) ?? null, [cities, city])
  const cityName = entry?.name ?? city
  const stats = statsData?.state === 'ready' ? statsData.stats : null
  const statsLoading = statsData === null || statsData.state === 'loading'

  const rawRail = searchParams.get('stacja')
  const rawTransit = searchParams.get('przystanek')
  const selectedName = searchParams.get('nazwa') ?? undefined
  const railId = rawRail !== null && STATION_ID_PATTERN.test(rawRail) ? rawRail : null
  const transitId = rawTransit !== null && GTFS_STOP_ID_PATTERN.test(rawTransit) ? rawTransit : null
  const hasSelection = railId !== null || transitId !== null

  function pick(option: StationOption): void {
    const name = encodeURIComponent(option.name)
    const param = option.kind === 'rail' ? 'stacja' : 'przystanek'
    router.push(`/miasto/${city}?${param}=${encodeURIComponent(option.id)}&nazwa=${name}`)
  }

  function clearSelection(): void {
    router.push(`/miasto/${city}`)
  }

  const railFavourite: Favourite | null =
    railId !== null ? { kind: 'pkp', id: railId, name: selectedName ?? railId } : null

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
        <TopBar
          title={`Odjazdy i przyjazdy — ${cityName}`}
          subtitle="Stacje kolejowe i przystanki komunikacji miejskiej"
          actions={<CityPicker cities={cities} current={city} />}
        />

        {!hasSelection && (
          <CityStatTiles stats={stats} loading={statsLoading} railStationCount={entry?.railStations.length ?? 0} />
        )}

        <StationSearch
          wide
          endpoint={`/api/search?city=${encodeURIComponent(city)}`}
          placeholder="Szukaj stacji kolejowej lub przystanku miejskiego…"
          onSelect={pick}
        />

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

            {transitId !== null && (
              <TransitStopDetail embedded city={city} stopId={transitId} initialName={selectedName} />
            )}
          </section>
        )}
      </main>

      {/* Prawa kolumna: widżet sieci komunikacji miejskiej — tylko gdy nie ma
          otwartego panelu szczegółów (ten ma własną kolumnę). */}
      {!hasSelection && (
        <aside className="hidden w-80 shrink-0 self-start sticky top-0 max-h-dvh overflow-y-auto py-7 pr-8 xl:flex xl:flex-col xl:gap-4">
          <CityWeatherCard city={city} />
          <CityTransitWidget city={city} cityName={cityName} />
        </aside>
      )}
    </>
  )
}
