'use client'

import Link from 'next/link'
import { useCities } from '@/hooks/useCities'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { encodeStopIdForPathSegment } from '@/lib/validation'
import { TransitDepartureList } from './TransitDepartureList'
import { IconButton } from './IconButton'
import { PIN_COLOR, StarIcon } from './icons'

type Props = {
  city: string
  stopId: string
  stopName: string
  onRemove: () => void
}

/**
 * Odpowiednik `StationCard` na Pulpicie dla przypiętego przystanku miejskiego.
 * Świadomie mówi „rozkład" i nie ma kolumny statusu — komunikacja miejska nie
 * ma opóźnień. Każda karta odpytuje swój przystanek osobno (GTFS nie ma limitu
 * zapytań; Pulpit trzyma kilka przypięć, nie kilkadziesiąt).
 */
export function TransitStopCard({ city, stopId, stopName, onRemove }: Props) {
  const { data, loading, failed } = useTransitBoard(city, [stopId], 3)
  // Ten sam wspólny hook `/api/cities` co `CityWeatherCard`/`TransitStopDetail`/
  // strona miasta (Task 9).
  const { cities: cityEntries } = useCities()
  const cityName = cityEntries.find((entry) => entry.id === city)?.name ?? city
  const board = data?.stops[0] ?? null
  const name = board?.name ?? stopName

  return (
    <article className="glass group relative isolate w-full overflow-hidden rounded-2xl border border-surface-border p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">{name}</h2>
        <IconButton label={`Odepnij z Pulpitu: ${name}`} onClick={onRemove} className="z-10">
          <StarIcon size={16} filled className={PIN_COLOR} />
        </IconButton>
      </div>

      <p className="mt-0.5 text-xs text-text-muted">Rozkład — {cityName}</p>

      {failed ? (
        <p className="mt-3 text-sm text-error-text">Nie udało się pobrać rozkładu.</p>
      ) : (
        <TransitDepartureList departures={board?.departures ?? []} loading={loading} />
      )}

      <Link
        href={`/city/${city}/stop/${encodeStopIdForPathSegment(stopId)}`}
        aria-label={`Pokaż przystanek: ${name}`}
        className="absolute inset-0 rounded-2xl focus:outline-none"
      />
    </article>
  )
}
