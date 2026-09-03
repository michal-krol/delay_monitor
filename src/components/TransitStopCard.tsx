'use client'

import Link from 'next/link'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { TransitDepartureList } from './TransitDepartureList'

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
  const { data, error } = useTransitBoard(city, [stopId], 3)
  const board = data?.stops[0] ?? null
  const name = board?.name ?? stopName

  return (
    <article className="glass group relative isolate w-full overflow-hidden rounded-2xl border p-5" style={{ borderColor: 'var(--surface-border)' }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">{name}</h2>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Odepnij z Pulpitu: ${name}`}
          className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-muted opacity-0 transition hover:bg-black/5 hover:text-foreground focus:opacity-100 group-hover:opacity-100 dark:hover:bg-white/10"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      <p className="mt-0.5 text-xs text-text-muted">Rozkład — {city}</p>

      {error !== null && data === null ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">Nie udało się wczytać rozkładu</p>
      ) : (
        <TransitDepartureList departures={board?.departures ?? []} loading={data === null} />
      )}

      <Link
        href={`/miasto/${city}/przystanek/${encodeURIComponent(stopId)}`}
        aria-label={`Pokaż przystanek: ${name}`}
        className="absolute inset-0 rounded-2xl focus:outline-none"
      />
    </article>
  )
}
