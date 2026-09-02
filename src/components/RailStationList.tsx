'use client'

import Link from 'next/link'
import { useBoard } from '@/hooks/useBoard'
import { ChevronRightIcon } from './icons'

type Station = { id: string; name: string }

/** Przeniesione z `/api/board` — realny użytkownik obserwuje kilka stacji. */
const MAX_STATIONS = 20

/**
 * Kolumna „Stacje kolejowe" na ekranie miasta. Ma opóźnienia i JE POKAZUJE
 * (średnie, punktualność liczone dokładnie tak jak dziś w `stationStats`) —
 * strona miejska ich nie ma i mówi „rozkład". Rozdzielenie kolumnami sprawia,
 * że nic nie udaje danych, których nie ma (niezmiennik #7 w układzie ekranu).
 */
export function RailStationList({ stations }: { stations: Station[] }) {
  const watched = stations.slice(0, MAX_STATIONS)
  const { data } = useBoard(watched.map((station) => station.id))
  const byId = new Map((data?.snapshots ?? []).filter((s) => s !== null).map((s) => [s.stationId, s]))

  if (stations.length === 0) {
    return <p className="text-sm text-text-secondary">Brak stacji kolejowych w rejestrze tego miasta.</p>
  }

  return (
    <ul className="space-y-1.5">
      {watched.map((station) => {
        const stats = byId.get(station.id)?.stats
        return (
          <li key={station.id}>
            <Link
              href={`/odjazdy/${station.id}?name=${encodeURIComponent(station.name)}`}
              className="glass flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{station.name}</span>
                {stats !== undefined && (
                  <span className="text-xs text-text-secondary">
                    śr. opóźnienie {stats.averageDelayMinutes ?? '—'} min · punktualność{' '}
                    {stats.punctualityPct ?? '—'}%
                  </span>
                )}
              </span>
              <ChevronRightIcon size={16} className="shrink-0 text-text-muted" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
