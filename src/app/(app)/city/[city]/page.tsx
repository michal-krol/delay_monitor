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
import { PageShell } from '@/components/aside'
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

  const rawRail = searchParams.get('station')
  const rawTransit = searchParams.get('stop')
  const selectedName = searchParams.get('name') ?? undefined
  const railId = rawRail !== null && STATION_ID_PATTERN.test(rawRail) ? rawRail : null
  const transitId = rawTransit !== null && GTFS_STOP_ID_PATTERN.test(rawTransit) ? rawTransit : null
  const hasSelection = railId !== null || transitId !== null

  function pick(option: StationOption): void {
    const name = encodeURIComponent(option.name)
    const param = option.kind === 'rail' ? 'station' : 'stop'
    router.push(`/city/${city}?${param}=${encodeURIComponent(option.id)}&name=${name}`)
  }

  function clearSelection(): void {
    router.push(`/city/${city}`)
  }

  const railFavourite: Favourite | null =
    railId !== null ? { kind: 'pkp', id: railId, name: selectedName ?? railId } : null

  return (
    <PageShell
      aside={
        !hasSelection ? (
          <>
            <CityWeatherCard city={city} />
            <CityTransitWidget city={city} cityName={cityName} />
          </>
        ) : undefined
      }
    >
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
    </PageShell>
  )
}
