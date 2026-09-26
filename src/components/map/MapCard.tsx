'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { CloseIcon, ArrowRightIcon } from '../icons'
import { DelayBadge } from '../DelayBadge'
import { LineBadge } from '../LineBadge'
import { MODE_ICON, MODE_LABEL } from '../transitMode'
import { TransitDepartureList } from '../TransitDepartureList'
import { useRailStationStatus } from '@/hooks/useRailStations'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { formatClockTime } from '@/lib/format'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { GtfsMode } from '@/lib/gtfs/types'
import { FADE_START_SEC, MODE_COLOR, ageLabel } from './mapData'

/** Co jest wybrane na mapie. Pojazd niesie tylko `id` — pozycja/linia żyją w odczytach co 15 s. */
export type MapSelection =
  | { kind: 'rail'; id: string; name: string; lat: number | null; lon: number | null }
  | { kind: 'stop'; id: string; groupId: string; name: string; mode: GtfsMode; lat: number | null; lon: number | null }
  | { kind: 'vehicle'; id: string }

/**
 * Karta wybranego obiektu — dokowana (decyzja 2026-09-26): na desktopie panel
 * obok mapy, na telefonie arkusz od dołu (układ daje rodzic). Nie modalna:
 * mapa zostaje w pełni używalna, Escape i „×” zamykają, fokus wchodzi na
 * nagłówek przy każdym nowym obiekcie i wraca, skąd przyszedł, po zamknięciu.
 *
 * Trzy stany wszędzie (AGENTS.md #7): wczytuje się / nie udało się / dane.
 */
export function MapCard({
  selection,
  vehicle,
  city,
  onClose,
  onShowRoute,
  following = false,
  onToggleFollow,
}: {
  selection: MapSelection
  /** Aktualny odczyt wybranego pojazdu; `null` = zniknął z feedu (pozycja > 180 s). */
  vehicle: CityVehicle | null
  city: string
  onClose: () => void
  /** „Pokaż trasę" z karty pojazdu — tryb linii w kierunku jazdy tego pojazdu. */
  onShowRoute?: (routeId: string, directionId: number | null) => void
  /** Kamera jedzie za tym pojazdem. */
  following?: boolean
  onToggleFollow?: () => void
}) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    returnFocusRef.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null
    headingRef.current?.focus({ preventScroll: true })
  }, [selection.kind, selection.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const target = returnFocusRef.current
      if (target !== null && target.isConnected) target.focus({ preventScroll: true })
    }
  }, [])

  const heading =
    selection.kind === 'vehicle'
      ? vehicle?.shortName !== null && vehicle?.shortName !== undefined
        ? `${MODE_LABEL[vehicle.mode ?? 'bus']} ${vehicle.shortName}`
        : 'Pojazd'
      : selection.name

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      className="glass-strong flex max-h-full flex-col overflow-hidden rounded-2xl shadow-xl"
    >
      <header className="flex items-start gap-3 border-b p-4" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-heading text-lg font-bold leading-tight outline-none first-letter:uppercase">
            {heading}
          </h2>
          <Subtitle selection={selection} vehicle={vehicle} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij kartę"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <CloseIcon size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" tabIndex={0} aria-label="Szczegóły">
        {selection.kind === 'rail' && <RailBody id={selection.id} />}
        {selection.kind === 'stop' && <StopBody selection={selection} city={city} />}
        {selection.kind === 'vehicle' && (
          <VehicleBody vehicle={vehicle} city={city} onShowRoute={onShowRoute} following={following} onToggleFollow={onToggleFollow} />
        )}
      </div>
    </section>
  )
}

function ModeDot({ mode }: { mode: GtfsMode }) {
  const Icon = MODE_ICON[mode]
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-white" style={{ background: MODE_COLOR[mode] }} aria-hidden="true">
      <Icon size={13} />
    </span>
  )
}

function Subtitle({ selection, vehicle }: { selection: MapSelection; vehicle: CityVehicle | null }) {
  const [mode, text] =
    selection.kind === 'rail'
      ? (['rail', 'Stacja kolejowa'] as const)
      : selection.kind === 'stop'
        ? ([selection.mode, selection.mode === 'metro' ? 'Stacja metra' : `Przystanek ${selection.mode === 'tram' ? 'tramwajowy' : 'autobusowy'}`] as const)
        : ([vehicle?.mode ?? 'bus', vehicle?.headsign !== null && vehicle?.headsign !== undefined ? `→ ${vehicle.headsign}` : 'kierunek nieznany'] as const)
  return (
    <p className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
      <ModeDot mode={mode} />
      {text}
    </p>
  )
}

function Action({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      style={{ background: 'var(--accent-gradient)' }}
    >
      {children}
      <ArrowRightIcon size={14} />
    </Link>
  )
}

function Skeleton() {
  return (
    <ul className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-10 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
      ))}
    </ul>
  )
}

function RailBody({ id }: { id: string }) {
  const { status, error } = useRailStationStatus(id)
  return (
    <>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Najbliższe odjazdy</h3>
      <div className="mt-2" aria-live="polite">
        {status === undefined && !error && <Skeleton />}
        {status === undefined && error && <p className="text-sm text-red-700 dark:text-red-300">Nie udało się sprawdzić odjazdów.</p>}
        {status === null && (
          <p className="text-sm text-text-secondary">Nie śledzimy teraz tej stacji. Otwórz tablicę — pobierzemy jej odjazdy.</p>
        )}
        {status !== null && status !== undefined && (
          <>
            {status.nextDepartures.length === 0 ? (
              <p className="text-sm text-text-secondary">Brak odjazdów w najbliższym czasie.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--surface-border)' }}>
                {status.nextDepartures.map((d) => (
                  <li key={`${d.plannedAt}-${d.trainLabel}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-11 shrink-0 font-semibold tabular-nums">{formatClockTime(d.plannedAt)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.headsign ?? '—'}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {d.trainLabel}
                        {d.platform !== null || d.track !== null ? ` · peron ${d.platform ?? '—'} / tor ${d.track ?? '—'}` : ''}
                      </span>
                    </span>
                    <DelayBadge status={d.status} delayMinutes={d.delayMinutes} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-text-muted">Aktualizacja {ageLabel(Math.round(status.ageMs / 1000))}</p>
          </>
        )}
      </div>
      <Action href={`/station/${id}`}>Pełna tablica</Action>
    </>
  )
}

function StopBody({ selection, city }: { selection: Extract<MapSelection, { kind: 'stop' }>; city: string }) {
  // Słupek (np. „Centrum 01") → odjazdy tylko z niego; stacja metra = cały zespół.
  const member = selection.id !== selection.groupId ? selection.id : null
  const { data, error } = useTransitBoard(city, [selection.id], 3, member)
  const board = data?.stops[0] ?? null
  const post = board?.members.find((m) => m.id === selection.id)
  const lines = post?.lines ?? board?.lines ?? []
  const loading = data === null && error === null

  return (
    <>
      {lines.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Linie">
          {lines.map((line) => (
            <li key={line.routeId}>
              <LineBadge line={line.line} color={line.color} mode={line.mode} size="sm" href={`/city/${city}/line/${line.routeId}`} />
            </li>
          ))}
        </ul>
      )}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Najbliższe odjazdy · rozkład</h3>
      <div aria-live="polite">
        {error !== null && data === null ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">Nie udało się pobrać rozkładu.</p>
        ) : (
          <TransitDepartureList departures={board?.departures ?? []} loading={loading || (data !== null && data.stops.length === 0)} city={city} />
        )}
      </div>
      <Action href={`/city/${city}/stop/${selection.id}`}>Rozkład przystanku</Action>
    </>
  )
}

function VehicleBody({
  vehicle,
  city,
  onShowRoute,
  following,
  onToggleFollow,
}: {
  vehicle: CityVehicle | null
  city: string
  onShowRoute?: (routeId: string, directionId: number | null) => void
  following?: boolean
  onToggleFollow?: () => void
}) {
  if (vehicle === null) {
    return <p className="text-sm text-text-secondary">Pojazd zniknął z mapy — od ponad 3 minut nie wysłał pozycji.</p>
  }
  const fresh = vehicle.ageSec <= FADE_START_SEC
  return (
    <>
      {vehicle.shortName !== null && vehicle.mode !== null && (
        <LineBadge line={vehicle.shortName} color={vehicle.color} mode={vehicle.mode} />
      )}
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Następny przystanek</dt>
          <dd className="font-semibold">{vehicle.nextStop?.name ?? 'nie wiadomo'}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Pozycja</dt>
          <dd>
            {ageLabel(vehicle.ageSec)} ·{' '}
            <span className={fresh ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}>
              {fresh ? 'aktualna' : 'nieaktualna'}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Numer boczny</dt>
          <dd>{vehicle.sideNumber !== '' ? vehicle.sideNumber : '—'}</dd>
        </div>
      </dl>
      {onToggleFollow !== undefined && (
        <button
          type="button"
          aria-pressed={following}
          onClick={onToggleFollow}
          className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            following ? 'text-white' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          style={following ? { background: 'var(--accent-gradient)', borderColor: 'transparent' } : { borderColor: 'var(--surface-border)' }}
        >
          {following ? 'Śledzę pojazd' : 'Śledź pojazd'}
        </button>
      )}
      <p className="mt-3 text-xs text-text-muted">Komunikacja miejska nie publikuje opóźnień — pokazujemy pozycję z GPS i rozkład.</p>
      {vehicle.routeId !== null ? (
        <>
          {onShowRoute !== undefined && (
            <button
              type="button"
              onClick={() => onShowRoute(vehicle.routeId!, vehicle.directionId)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              Pokaż trasę na mapie
            </button>
          )}
          <Action href={`/city/${city}/line/${vehicle.routeId}`}>Rozkład linii</Action>
        </>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">Brak przypisania do linii.</p>
      )}
    </>
  )
}
