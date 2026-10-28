import type { ReactNode } from 'react'
import Link from 'next/link'
import type { GtfsDeparture } from '@/lib/gtfs/types'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'
import { countdownLabel } from '@/lib/countdown'
import { effectiveAgeMs } from '@/lib/format'
import { LineBadge } from './LineBadge'
import { OnRequestBadge } from './OnRequestBadge'
import { LINE_KIND_LABEL } from './transitMode'
import { HIDE_AFTER_SEC } from './map/mapData'
import { useNow } from '@/hooks/useNow'
import { useRowAnimation } from '@/hooks/useRowAnimation'
import { courseHref, departureDateLabel, timetableHref } from '@/lib/courseView'
import { CourseVehicleActions, type CourseVehicle } from './CourseVehicleActions'

type DepartureWithVehicle = GtfsDeparture & { vehicle?: (CourseVehicle & { stopsAway: number | null }) | null }

/** Jak często odświeżamy wiek pozycji pojazdu między odpytaniami (30 s) — wygaszanie nieaktualnych pozycji. */
const VEHICLE_AGE_TICK_MS = 10_000

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
  /**
   * Kiedy przeglądarka dostała odpowiedź (`lastSuccessAt` z `useTransitBoard`). `vehicle.ageSec` jest
   * zamrożony w chwili odpowiedzi, więc dokładamy czas od pobrania — brak = wiek z odpowiedzi.
   */
  fetchedAt?: number | null
  /** `card` (Start): cały wiersz linkuje do linii (wymaga `city`). */
  variant?: 'board' | 'card'
  /** Ile wierszy szkieletu przy wczytywaniu (karta Startu pokazuje mniej kursów). */
  skeletonRows?: number
  /** Pod komunikatem o braku odjazdów (np. przycisk „Wszystkie linie”, gdy filtr linii nic nie zostawił). */
  emptyAction?: ReactNode
  returnTo?: string
  stopNames?: Record<string, string>
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
 * celowe: godziny pozostają rozkładowe, bez minut opóźnienia i ETA.
 * ADR0014 dopuszcza wyłącznie konserwatywny symbol wywnioskowany z GPS.
 */
function DepartureRow({
  departure,
  city,
  showStopCode,
  now,
  variant,
  clock: vehicleClock,
  fetchedAt,
  returnTo,
  stopNames,
}: {
  departure: DepartureWithVehicle
  city?: string
  showStopCode: boolean
  now?: number
  variant: 'board' | 'card'
  clock: number
  fetchedAt?: number | null
  returnTo?: string
  stopNames?: Record<string, string>
}) {
  // Odliczanie tylko w obrębie godziny; „wg rozkładu” zawsze, bo to plan, nie pomiar (#13).
  const countdown = now !== undefined ? countdownLabel(now, departure.plannedAt) : null
  const lineHref = city !== undefined ? (variant === 'card' ? `/city/${city}/line/${encodeURIComponent(departure.routeId)}` : timetableHref(city, departure.routeId, departure.stopId, departure.directionId, departure.stopOccurrence)) : undefined
  const selectedCourseHref = city !== undefined && !departure.frequencyBased && variant === 'board' ? courseHref(city, departure.routeId, departure, returnTo) : undefined
  const dateLabel = now === undefined ? null : departureDateLabel(departure.plannedAt, now)
  // Karta: link na cały wiersz, więc plakietka linii nie może być drugim (zagnieżdżonym) linkiem.
  const rowHref = variant === 'card' ? lineHref : undefined
  const scheduleNote = countdown !== null ? `${countdown} · wg rozkładu` : 'wg rozkładu'
  const rawTag = stopTagOf(departure, true)
  const fullStopName = variant === 'card' && stopNames?.[departure.stopId]
  const tag = showStopCode && !fullStopName ? rawTag : null
  const stopCode = rawTag !== null && (tag !== null || (fullStopName && !rawTag.platform)) ? rawTag.code : null
  // Numer przystanku z `platform_code` już jest w tagu — „peron 01" obok byłby duplikatem.
  const platform = departure.platformCode !== stopCode ? departure.platformCode : null
  // Pozycja starsza niż na mapie (`HIDE_AFTER_SEC`) nie jest już pozycją — chip znika, wiersz zostaje.
  // Wiek liczony raz (odpowiedź + czas od pobrania) i dla etykiety, i dla progu.
  const vehicleAgeSec =
    departure.vehicle != null ? (effectiveAgeMs(departure.vehicle.ageSec * 1000, fetchedAt, vehicleClock) ?? 0) / 1000 : 0
  const vehicle = departure.vehicle != null && vehicleAgeSec <= HIDE_AFTER_SEC ? departure.vehicle : null
  const hasMeta =
    tag !== null ||
    LINE_KIND_LABEL[departure.lineKind] !== '' ||
    departure.frequencyBased ||
    departure.onRequest ||
    platform !== null
  const rowClass = `grid ${variant === 'card' ? 'grid-cols-1 @min-[14rem]:grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(0,1fr)_auto]'} items-start gap-x-3 gap-y-1 py-3${variant === 'board' && city !== undefined ? ' course-departure-row' : ''}`
  const metaColumns = variant === 'card' ? 'col-start-1 col-span-1 @min-[14rem]:col-start-2 @min-[14rem]:col-span-2' : 'col-start-2 col-span-2'
  const cells = (
    <>
      <span className={variant === 'board' && city !== undefined ? 'row-span-3 flex w-[88px] flex-col items-start' : undefined}>
      <LineBadge
        line={departure.line}
        kind={departure.lineKind}
        mode={departure.mode}
        size="sm"
        href={rowHref === undefined ? lineHref : undefined}
      />
      {variant === 'board' && city !== undefined && <CourseVehicleActions city={city} vehicle={vehicle} />}
      </span>
      <span data-testid="departure-headsign" className="min-w-0 text-sm text-foreground [overflow-wrap:anywhere]">
        {departure.headsign ?? '—'}
        {variant === 'board' && vehicle?.sideNumber && <span className="mt-1 block text-xs text-text-secondary">Nr boczny {vehicle.sideNumber}</span>}
      </span>
      {selectedCourseHref !== undefined ? (
        <Link href={selectedCourseHref} aria-label={`Wybierz kurs ${departure.line}, ${clock(departure.plannedAt)}${dateLabel === null ? '' : `, ${dateLabel}`}, kierunek ${departure.headsign ?? 'nieznany'}`} className="press flex min-h-11 min-w-11 flex-col items-end justify-center rounded-lg text-primary-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary-text">
          <time dateTime={departure.plannedAt} className="time-dominant">{clock(departure.plannedAt)}</time>
          {dateLabel !== null && <span className="text-[13px] font-medium tabular-nums">{dateLabel}</span>}
        </Link>
      ) : (
        <span className="flex flex-col items-end">
          <time dateTime={departure.plannedAt} className="time-dominant text-foreground shrink-0">{clock(departure.plannedAt)}</time>
          {dateLabel !== null && <span className="text-[13px] font-medium tabular-nums text-text-secondary">{dateLabel}</span>}
        </span>
      )}
      <span className={`${metaColumns} text-xs font-semibold tabular-nums text-text-secondary`}>{scheduleNote}</span>
      {variant === 'card' && stopNames?.[departure.stopId] && <span className={`${metaColumns} text-xs text-text-muted [overflow-wrap:anywhere]`}>{stopNames[departure.stopId]}</span>}
      {hasMeta && (
        <div data-testid="departure-meta" className={`${metaColumns} flex flex-wrap items-center gap-x-2 gap-y-1`}>
          {tag !== null && <StopTag code={tag.code} platform={tag.platform} />}
          {LINE_KIND_LABEL[departure.lineKind] !== '' && <span className="shrink-0 text-xs text-text-muted">{LINE_KIND_LABEL[departure.lineKind]}</span>}
          {departure.frequencyBased && (
            <span className="shrink-0 text-xs text-text-muted">co kilka min</span>
          )}
          {departure.onRequest && <OnRequestBadge />}
          {platform !== null && <span className="shrink-0 text-xs text-text-secondary">peron {platform}</span>}
        </div>
      )}
    </>
  )
  return rowHref !== undefined ? (
    <li className="@container flex min-w-0 items-start gap-2">
      <Link
        href={rowHref}
        transitionTypes={NAV_FORWARD_TYPES}
        className={`${rowClass} min-w-0 flex-1 -mx-2 rounded-lg px-2 transition hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-primary-text focus-visible:outline-none dark:hover:bg-white/[0.06]`}
      >
        {cells}
      </Link>
      {city !== undefined && vehicle !== null && <span className="pt-3"><CourseVehicleActions city={city} vehicle={vehicle} /></span>}
    </li>
  ) : (
    <li className={rowClass}>{cells}</li>
  )
}

export function TransitDepartureList({
  departures,
  loading = false,
  emptyMessage = 'Brak odjazdów w rozkładzie',
  city,
  showStopCode = false,
  now,
  fetchedAt,
  variant = 'board',
  skeletonRows = 3,
  emptyAction,
  returnTo,
  stopNames,
}: Props) {
  const listRef = useRowAnimation<HTMLUListElement>()
  const clock = useNow(VEHICLE_AGE_TICK_MS)
  const visibleDepartures = departures.filter((departure) => {
    if (variant !== 'board' || !departure.retainedForVehicle) return true
    const observed = Date.parse(departure.vehicle?.observedAt ?? '')
    const ageMs = clock - observed
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 60_000
  })
  if (loading) {
    return (
      <>
        <span className="sr-only">Wczytywanie…</span>
        <ul className="mt-3 space-y-2" aria-hidden="true">
          {Array.from({ length: skeletonRows }, (_, i) => (
            <li key={i} className="h-10 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
          ))}
        </ul>
      </>
    )
  }

  if (visibleDepartures.length === 0) {
    return (
      <>
        <p className="mt-3 text-sm text-text-secondary">{emptyMessage}</p>
        {emptyAction}
      </>
    )
  }

  return (
    <ul ref={listRef} data-testid="departure-list" className={`mt-3 divide-y divide-surface-border${variant === 'board' && city !== undefined ? ' course-board' : ' grid @min-[48rem]:grid-cols-3 @min-[48rem]:divide-x @min-[48rem]:divide-y-0 @min-[48rem]:gap-4'}`}>
      {visibleDepartures.map((departure, index) => (
        <DepartureRow key={`${departure.tripId}-${departure.stopId}-${index}`} departure={departure} city={city} showStopCode={showStopCode} now={now} variant={variant} clock={clock} fetchedAt={fetchedAt} returnTo={returnTo} stopNames={stopNames} />
      ))}
    </ul>
  )
}
