import type { GtfsDeparture } from '@/lib/gtfs/types'
import { LineBadge } from './LineBadge'

type DepartureWithVehicle = GtfsDeparture & { vehicle?: { stopsAway: number; ageSec: number } | null }

type Props = {
  departures: DepartureWithVehicle[]
  loading?: boolean
  /** Nagłówek listy — domyślnie „Rozkład". NIGDY „na czas": komunikacja miejska nie ma realizacji. */
  emptyMessage?: string
  /** Gdy podane — plakietka linii linkuje do jej szczegółów (`/city/[city]/line/[routeId]`). */
  city?: string
  /** Pokaż numer słupka przy każdym odjeździe (widok całego zespołu Centrum 01/02…). */
  showSlupek?: boolean
  /** Znacznik czasu (`Date.now()`-owy) do liczenia kolumny „Za" — brak = kolumna schowana. */
  now?: number
  /** Wyróżnij pierwszy odjazd osobnym blokiem nad listą (tylko zakładka „Najbliższe odjazdy"). */
  highlightFirst?: boolean
}

/** `plannedAt` niesie już offset strefy miasta — HH:MM wycinamy wprost z ISO. */
const clock = (iso: string) => iso.slice(11, 16)

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} min`
}

/** `null` = odjazd już minął. Świadomie nie pokazujemy ujemnych „za −5 min" (wzorem `ConnectionDetails.tsx`). */
function relativeLabel(plannedAt: string, now: number): string | null {
  const minutes = Math.round((new Date(plannedAt).getTime() - now) / 60_000)
  if (minutes < 1) return null
  return `za ${formatDuration(minutes)}`
}

/**
 * Lista odjazdów przystanku miejskiego. Rozdzielenie od tablicy PKP jest
 * celowe: tu nie ma opóźnień, więc nie ma kolumny statusu — jest „rozkład".
 * Nic nie udaje danych, których nie ma (niezmiennik #7 w układzie ekranu).
 */
function DepartureRow({
  departure,
  index,
  city,
  showSlupek,
  now,
}: {
  departure: DepartureWithVehicle
  index: number
  city?: string
  showSlupek: boolean
  now?: number
}) {
  const relative = now !== undefined ? relativeLabel(departure.plannedAt, now) : null
  return (
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
        href={city !== undefined ? `/city/${city}/line/${encodeURIComponent(departure.routeId)}` : undefined}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {departure.headsign ?? '—'}
      </span>
      {showSlupek && (departure.stopCode ?? departure.platformCode) !== null && (
        <span
          title={`Odjazd z: ${departure.stopCode ?? departure.platformCode}`}
          className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary dark:bg-white/10"
        >
          {departure.stopCode ?? departure.platformCode}
        </span>
      )}
      {departure.vehicle != null && (
        <span
          title={departure.vehicle.ageSec > 60 ? `${Math.round(departure.vehicle.ageSec / 60)} min temu` : 'na żywo'}
          className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300"
        >
          {departure.vehicle.stopsAway === 0 ? 'zaraz będzie' : `${departure.vehicle.stopsAway} przyst.`}
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
      {relative !== null && (
        <span className="shrink-0 text-xs font-semibold tabular-nums text-text-secondary">{relative}</span>
      )}
    </li>
  )
}

export function TransitDepartureList({
  departures,
  loading = false,
  emptyMessage = 'Brak odjazdów w rozkładzie',
  city,
  showSlupek = false,
  now,
  highlightFirst = false,
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

  // Wyróżnienie tylko gdy mamy `now` ORAZ pierwszy odjazd faktycznie jeszcze
  // nie minął — inaczej odjazd zniknąłby z listy bez pokazania się w bloku
  // (AGENTS.md #7: nic nie znika po cichu).
  const [first, ...rest] = departures
  const highlightRelative = highlightFirst && now !== undefined ? relativeLabel(first.plannedAt, now) : null
  const showHighlight = highlightRelative !== null
  const listed = showHighlight ? rest : departures

  return (
    <>
      {showHighlight && (
        <div className="mt-3 glass-strong rounded-2xl p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Najbliższy odjazd</div>
          <div className="mt-2 flex items-center gap-3">
            <LineBadge line={first.line} color={first.color} mode={first.mode} size="md" />
            <span className="min-w-0 flex-1 truncate font-heading text-lg font-bold text-foreground">
              {first.headsign ?? '—'}
            </span>
            <div className="shrink-0 text-right">
              <div className="font-heading text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                {highlightRelative}
              </div>
              <div className="text-xs text-text-secondary">Planowo: {clock(first.plannedAt)}</div>
            </div>
          </div>
        </div>
      )}

      {listed.length > 0 && (
        <ul className="mt-3 divide-y" style={{ borderColor: 'var(--surface-border)' }}>
          {listed.map((departure, index) => (
            <DepartureRow key={`${departure.tripId}-${departure.stopId}-${index}`} departure={departure} index={index} city={city} showSlupek={showSlupek} now={now} />
          ))}
        </ul>
      )}
    </>
  )
}
