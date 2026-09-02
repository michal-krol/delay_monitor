import type { GtfsDeparture } from '@/lib/gtfs/types'
import { LineBadge } from './LineBadge'

type Props = {
  departures: GtfsDeparture[]
  loading?: boolean
  /** Nagłówek listy — domyślnie „Rozkład". NIGDY „na czas": komunikacja miejska nie ma realizacji. */
  emptyMessage?: string
}

/** `plannedAt` niesie już offset strefy miasta — HH:MM wycinamy wprost z ISO. */
const clock = (iso: string) => iso.slice(11, 16)

/**
 * Lista odjazdów przystanku miejskiego. Rozdzielenie od tablicy PKP jest
 * celowe: tu nie ma opóźnień, więc nie ma kolumny statusu — jest „rozkład".
 * Nic nie udaje danych, których nie ma (niezmiennik #7 w układzie ekranu).
 */
export function TransitDepartureList({ departures, loading = false, emptyMessage = 'Brak odjazdów w rozkładzie' }: Props) {
  if (loading) {
    return (
      <ul className="mt-3 space-y-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-10 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
        ))}
      </ul>
    )
  }

  if (departures.length === 0) {
    return <p className="mt-3 text-sm text-text-secondary">{emptyMessage}</p>
  }

  return (
    <ul className="mt-3 divide-y" style={{ borderColor: 'var(--surface-border)' }}>
      {departures.map((departure, index) => (
        <li
          key={`${departure.tripId}-${departure.stopId}-${index}`}
          className="flex items-center gap-3 py-2.5"
        >
          <time
            dateTime={departure.plannedAt}
            className="w-12 shrink-0 font-semibold tabular-nums text-foreground"
          >
            {clock(departure.plannedAt)}
          </time>
          <LineBadge line={departure.line} color={departure.color} mode={departure.mode} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {departure.headsign ?? '—'}
          </span>
          {departure.frequencyBased && (
            <span className="shrink-0 text-xs text-text-muted">co kilka min</span>
          )}
          {departure.platformCode !== null && (
            <span className="shrink-0 text-xs text-text-secondary">peron {departure.platformCode}</span>
          )}
          {/* GTFS `0` = brak informacji, nie „niedostępny" — pokazujemy wyłącznie potwierdzoną dostępność. */}
          {departure.wheelchair === 1 && (
            <span className="shrink-0 text-xs text-text-muted" title="Przystanek dostępny dla wózków">
              ♿
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
