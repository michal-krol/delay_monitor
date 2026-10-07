import type { GtfsDeparture } from '@/lib/gtfs/types'
import { countdownLabel } from '@/lib/countdown'
import { LineBadge } from './LineBadge'
import { OnRequestBadge } from './OnRequestBadge'
import { LINE_KIND_LABEL } from './transitMode'
import { LiveDot } from './LiveDot'
import { useRowAnimation } from '@/hooks/useRowAnimation'

type DepartureWithVehicle = GtfsDeparture & { vehicle?: { stopsAway: number; ageSec: number } | null }

type Props = {
  departures: DepartureWithVehicle[]
  loading?: boolean
  /** Nagłówek listy — domyślnie „Rozkład". NIGDY „na czas": komunikacja miejska nie ma realizacji. */
  emptyMessage?: string
  /** Gdy podane — plakietka linii linkuje do jej szczegółów (`/city/[city]/line/[routeId]`). */
  city?: string
  /** Pokaż numer przystanku przy każdym odjeździe (widok całego zespołu: Centrum 01/02…). */
  showStopCode?: boolean
  /** Znacznik czasu (`Date.now()`-owy) do liczenia kolumny „Za" — brak = kolumna schowana. */
  now?: number
  /** Wyróżnij pierwszy odjazd osobnym blokiem nad listą (tylko zakładka „Najbliższe odjazdy"). */
  highlightFirst?: boolean
}

/**
 * Numer przystanku zespołu, z którego rusza kurs („02"): `stop_code`, a gdy feed go nie
 * podaje — `platform_code` (gtfs.md). Wiersz chowa wtedy „peron X" z tą samą wartością.
 * Metro bez `stop_code` ma w `platform_code` peron stacji („P1”), nie numer przystanku.
 */
function StopTag({ code, platform = false }: { code: string; platform?: boolean }) {
  return (
    <span
      title={platform ? `Peron ${code}` : `Odjazd z przystanku ${code}`}
      className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-text-secondary dark:bg-white/10"
    >
      <span className="sr-only">{platform ? 'peron' : 'Odjazd z przystanku'}</span> {code}
    </span>
  )
}

/** Numer do tagu (`null` = bez tagu) i czy to peron metra (patrz `StopTag`). */
function stopTagOf(departure: DepartureWithVehicle, showStopCode: boolean): { code: string; platform: boolean } | null {
  if (!showStopCode) return null
  if (departure.stopCode !== null) return { code: departure.stopCode, platform: false }
  if (departure.platformCode === null) return null
  return { code: departure.platformCode, platform: departure.mode === 'metro' }
}

/** `plannedAt` niesie już offset strefy miasta — HH:MM wycinamy wprost z ISO. */
const clock = (iso: string) => iso.slice(11, 16)

/**
 * Lista odjazdów przystanku miejskiego. Rozdzielenie od tablicy PKP jest
 * celowe: tu nie ma opóźnień, więc nie ma kolumny statusu — jest „rozkład".
 * Nic nie udaje danych, których nie ma (niezmiennik #7 w układzie ekranu).
 */
function DepartureRow({
  departure,
  index,
  city,
  showStopCode,
  now,
}: {
  departure: DepartureWithVehicle
  index: number
  city?: string
  showStopCode: boolean
  now?: number
}) {
  // Odliczanie tylko w obrębie godziny, z dopiskiem „wg rozkładu”: to plan, nie pomiar (#13).
  const countdown = now !== undefined ? countdownLabel(now, departure.plannedAt) : null
  const tag = stopTagOf(departure, showStopCode)
  const stopCode = tag?.code ?? null
  const hasStopTag = tag !== null
  // Numer przystanku z `platform_code` już jest w tagu — „peron 01" obok byłby duplikatem.
  const platform = departure.platformCode !== stopCode ? departure.platformCode : null
  const hasMeta =
    hasStopTag ||
    departure.vehicle != null ||
    LINE_KIND_LABEL[departure.lineKind] !== '' ||
    departure.frequencyBased ||
    departure.onRequest ||
    platform !== null
  return (
    <li
      key={`${departure.tripId}-${departure.stopId}-${index}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
    >
      <time
        dateTime={departure.plannedAt}
        className="w-12 shrink-0 font-semibold tabular-nums text-foreground"
      >
        {clock(departure.plannedAt)}
      </time>
      <LineBadge
        line={departure.line}
        kind={departure.lineKind}
        mode={departure.mode}
        size="sm"
        href={city !== undefined ? `/city/${city}/line/${encodeURIComponent(departure.routeId)}` : undefined}
      />
      <span data-testid="departure-headsign" className="min-w-0 flex-1 truncate text-sm text-foreground">
        {departure.headsign ?? '—'}
      </span>
      {/* Oznaczenia dodatkowe: na wąskiej liście (kontener < `@xl`) schodzą do
          drugiego wiersza (`order-last basis-full`), wcięte `pl-15` pod plakietkę
          linii (nie pod nazwę kierunku), na
          szerokiej zostają w jednym rzędzie z resztą. Do sześciu `shrink-0` w
          jednym wierszu ściskało kierunek do 0 px na 375 px. */}
      {hasMeta && (
        <div className="order-last flex basis-full flex-wrap items-center gap-x-2 gap-y-1 pl-15 @xl:order-none @xl:basis-auto @xl:flex-nowrap @xl:pl-0">
          {tag !== null && <StopTag code={tag.code} platform={tag.platform} />}
          {departure.vehicle != null && (
            <span
              title={departure.vehicle.ageSec > 60 ? `${Math.round(departure.vehicle.ageSec / 60)} min temu` : 'na żywo'}
              className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300"
            >
              {departure.vehicle.ageSec <= 60 && <LiveDot />}
              {departure.vehicle.stopsAway === 0 ?'zaraz będzie' : `${departure.vehicle.stopsAway} przyst.`}
              <span className="sr-only">
                , {departure.vehicle.ageSec > 60 ? `pozycja sprzed ${Math.round(departure.vehicle.ageSec / 60)} min` : 'pozycja na żywo'}
              </span>
            </span>
          )}
          {LINE_KIND_LABEL[departure.lineKind] !== '' && <span className="shrink-0 text-xs text-text-muted">{LINE_KIND_LABEL[departure.lineKind]}</span>}
          {departure.frequencyBased && (
            <span className="shrink-0 text-xs text-text-muted">co kilka min</span>
          )}
          {departure.onRequest && <OnRequestBadge />}
          {platform !== null && <span className="shrink-0 text-xs text-text-secondary">peron {platform}</span>}
        </div>
      )}
      {countdown !== null && (
        // Wąska lista: osobna linia pod godziną (wcięta jak oznaczenia), szeroka: na końcu wiersza.
        <span className="order-last basis-full pl-15 text-xs font-semibold tabular-nums text-text-secondary @xl:order-none @xl:basis-auto @xl:pl-0">{`${countdown} · wg rozkładu`}</span>
      )}
    </li>
  )
}

export function TransitDepartureList({
  departures,
  loading = false,
  emptyMessage = 'Brak odjazdów w rozkładzie',
  city,
  showStopCode = false,
  now,
  highlightFirst = false,
}: Props) {
  const listRef = useRowAnimation<HTMLUListElement>()
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
  const highlightRelative = highlightFirst && now !== undefined ? countdownLabel(now, first.plannedAt, Infinity) : null
  const showHighlight = highlightRelative !== null
  const firstTag = stopTagOf(first, showStopCode)
  const listed = showHighlight ? rest : departures

  return (
    <>
      {showHighlight && (
        <div className="mt-3 glass-strong rounded-2xl p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Najbliższy odjazd</div>
          {/* `flex-wrap` + `ml-auto`: na 320 px długie „za 2 h 42 min" schodzi do drugiego wiersza
              zamiast wypychać stronę w bok (kierunek ma `min-w-0`, więc zawija się dopiero, gdy nie mieści się reszta). */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <LineBadge line={first.line} mode={first.mode} kind={first.lineKind} size="md" />
            <span className="min-w-0 flex-1 truncate font-heading text-lg font-bold text-foreground">
              {first.headsign ?? '—'}
            </span>
            {firstTag !== null && <StopTag code={firstTag.code} platform={firstTag.platform} />}
            <div className="ml-auto shrink-0 text-right">
              <div className="font-heading text-2xl font-extrabold tabular-nums text-indigo-600 dark:text-indigo-400">
                {highlightRelative}
              </div>
              <div className="text-xs text-text-secondary">Planowo: {clock(first.plannedAt)}</div>
            </div>
          </div>
        </div>
      )}

      {listed.length > 0 && (
        <ul ref={listRef} data-testid="departure-list" className="@container mt-3 divide-y divide-surface-border">
          {listed.map((departure, index) => (
            <DepartureRow key={`${departure.tripId}-${departure.stopId}-${index}`} departure={departure} index={index} city={city} showStopCode={showStopCode} now={now} />
          ))}
        </ul>
      )}
    </>
  )
}
