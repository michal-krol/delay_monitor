'use client'

import { useEffect, useMemo } from 'react'
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { CityPicker } from '@/components/CityPicker'
import { CityStatTiles } from '@/components/CityStatTiles'
import { CityTransitWidget } from '@/components/CityTransitWidget'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { FullBoard } from '@/components/FullBoard'
import { TransitStopDetail } from '@/components/TransitStopDetail'
import { PageShell } from '@/components/aside'
import { RecentPlaces } from '@/components/RecentPlaces'
import { ArrowLeftIcon, ICON_SIZE } from '@/components/icons'
import { ShareButton } from '@/components/ShareButton'
import { pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { useCities } from '@/hooks/useCities'
import { useCityContext } from '@/hooks/useCityContext'
import { useCityStats } from '@/hooks/useCityStats'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

export default function CityPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const router = useRouter()
  const searchParams = useSearchParams()
  const { setCity } = useCityContext()
  const { isPinned, addPinned, removePinned } = usePinned()
  const { data: statsData } = useCityStats(city)
  const { state: citiesState, cities } = useCities()

  useEffect(() => {
    setCity(city)
  }, [city, setCity])

  const entry = useMemo(() => cities.find((option) => option.id === city) ?? null, [cities, city])
  // `null` dopóki /api/cities się nie wczyta / gdy zawiedzie / gdy wyszukanie
  // stacji PKP dla tego miasta zawiodło (railStationsUnknown) — nigdy `0`
  // jako "nie wiadomo" (AGENTS.md #7). `CityStatTiles` renderuje to jako „—".
  const railStationCount = citiesState !== 'ready' || entry === null || entry.railStationsUnknown === true ? null : entry.railStations.length
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

  const railPinned: PinnedItem | null =
    railId !== null ? { kind: 'pkp', id: railId, name: selectedName ?? railId } : null

  return (
    <PageShell
      aside={!hasSelection ? <CityTransitWidget city={city} cityName={cityName} /> : undefined}
    >
      {/* Z wybraną stacją/przystankiem nagłówek na telefonie jest zwarty (tytuł dla czytnika),
          żeby pierwszy odjazd tablicy zmieścił się na ekranie — jak na mapie. */}
      <TopBar
        city={city}
        compact={hasSelection}
        title={`Odjazdy i przyjazdy — ${cityName}`}
        subtitle="Stacje kolejowe i przystanki komunikacji miejskiej"
        actions={
          <>
            {/* „Udostępnij" tylko z wybraną stacją/przystankiem — sam ekran miasta to wyszukiwarka. */}
            {hasSelection && <ShareButton />}
            <CityPicker compact={hasSelection} cities={cities} current={city} />
          </>
        }
      />

      {/* Telefon: najpierw wyszukiwarka, kafelki pod nią (`order`, kafelki nie są fokusowalne,
          więc kolejność Tab się nie rozjeżdża). Desktop bez zmian. */}
      {!hasSelection && (
        <div className="max-sm:order-1">
          <CityStatTiles stats={stats} loading={statsLoading} railStationCount={railStationCount} />
        </div>
      )}

      {/* Telefon z wybraną tablicą: pole chowa się (szukanie jest pod lupą w nagłówku aplikacji,
          a „Wróć do wyszukiwania” przywraca ekran wyszukiwania) — pierwszy odjazd ma być widoczny. */}
      <div className={hasSelection ? 'max-sm:hidden' : undefined}>
        <StationSearch
          wide
          endpoint={`/api/search?city=${encodeURIComponent(city)}`}
          placeholder="Szukaj stacji kolejowej lub przystanku miejskiego…"
          onSelect={pick}
        />
      </div>

      {/* Pod wyszukiwarką zamiast pustki: ostatnio oglądane (dane już są, zero zapytań). */}
      {!hasSelection && <RecentPlaces limit={4} />}

      {hasSelection && (
        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={clearSelection}
            className="press touch-44 relative inline-flex items-center gap-2 self-start text-sm font-semibold text-text-secondary hover:text-foreground"
          >
            <ArrowLeftIcon size={ICON_SIZE.button} />
            Wróć do wyszukiwania
          </button>

          {railId !== null && railPinned !== null && (
            <FullBoard
              embedded
              stationId={railId}
              stationName={railPinned.name}
              isPinned={isPinned(pinnedKey(railPinned))}
              onTogglePin={() =>
                isPinned(pinnedKey(railPinned))
                  ? removePinned(pinnedKey(railPinned))
                  : addPinned(railPinned)
              }
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
