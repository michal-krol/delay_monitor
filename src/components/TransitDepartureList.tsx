import type { GtfsDeparture } from '@/lib/gtfs/types'
import { LineBadge } from './LineBadge'

type Props = {
  departures: GtfsDeparture[]
  loading?: boolean
  /** Nagłówek listy — domyślnie „Rozkład". NIGDY „na czas": komunikacja miejska nie ma realizacji. */
  emptyMessage?: string
  /** Gdy podane — plakietka linii linkuje do jej szczegółów (`/miasto/[city]/linia/[routeId]`). */
  city?: string
  /** Pokaż numer słupka przy każdym odjeździe (widok całego zespołu Centrum 01/02…). */
  showSlupek?: boolean
}

/** `plannedAt` niesie już offset strefy miasta — HH:MM wycinamy wprost z ISO. */
const clock = (iso: string) => iso.slice(11, 16)

/**
 * Lista odjazdów przystanku miejskiego. Rozdzielenie od tablicy PKP jest
 * celowe: tu nie ma opóźnień, więc nie ma kolumny statusu — jest „rozkład".
 * Nic nie udaje danych, których nie ma (niezmiennik #7 w układzie ekranu).
 */
export function TransitDepartureList({
  departures,
  loading = false,
  emptyMessage = 'Brak odjazdów w rozkładzie',
  city,
  showSlupek = false,
}: Props) {
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
          <LineBadge
            line={departure.line}
            color={departure.color}
            mode={departure.mode}
            size="sm"
            href={city !== undefined ? `/miasto/${city}/linia/${encodeURIComponent(departure.routeId)}` : undefined}
          />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {departure.headsign ?? '—'}
          </span>
          {showSlupek && departure.stopCode !== null && (
            <span
              title={`Odjazd ze słupka ${departure.stopCode}`}
              className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary dark:bg-white/10"
            >
              słup. {departure.stopCode}
            </span>
          )}
          {departure.lineKind === 'night' && <span className="shrink-0 text-xs text-text-muted">nocna</span>}
          {departure.lineKind === 'express' && <span className="shrink-0 text-xs text-text-muted">przyspieszona</span>}
          {departure.frequencyBased && (
            <span className="shrink-0 text-xs text-text-muted">co kilka min</span>
          )}
          {departure.onRequest && (
            <span
              title="Przystanek na żądanie — zasygnalizuj kierowcy chęć wsiadania / wysiadania"
              className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              na żądanie
            </span>
          )}
          {departure.platformCode !== null && (
            <span className="shrink-0 text-xs text-text-secondary">peron {departure.platformCode}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
