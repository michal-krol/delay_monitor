'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { OnRequestBadge } from './OnRequestBadge'
import { AccessibleIcon, ChevronRightIcon, VehicleHeadingIcon, ICON_SIZE } from './icons'
import { darkRingClass, lineColor } from './transitMode'
import { stopDisplayName } from './stopName'
import { hasCustomStroke, strokeFor } from './map/mapData'
import { formatAgo, formatSecondsOfDay } from '@/lib/format'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'
import { pluralPl } from '@/lib/plural'
import { encodeStopIdForPathSegment } from '@/lib/validation'
import type { LineRouteStop } from '@/lib/gtfs/query'
import type { GtfsMode, LineKind } from '@/lib/gtfs/types'
import type { VehicleOnRoute } from '@/lib/gtfs/vehicleProject'

type Props = {
  city: string
  stops: LineRouteStop[]
  /** Podświetla PIERWSZE wystąpienie tego przystanku (przebieg może go powtórzyć). */
  selectedStopId: string | null
  /** Wybrany start kursu (sekundy doby): z nim wiersze pokazują godziny, bez niego przesunięcie „+N min”. */
  selectedBaseSec: number | null
  /** Wiersz do podświetlenia; ma pierwszeństwo przed dopasowaniem po `selectedStopId` (pętla powtarza przystanek). */
  selectedIndex?: number
  /** Tylko zgłasza wybór — zero zapytań. `index` = wiersz, w który kliknięto. */
  onSelectStop: (stopId: string, index?: number) => void
  vehicles?: VehicleOnRoute[]
  mode: GtfsMode
  kind: LineKind
}

const NO_VEHICLES: VehicleOnRoute[] = []

/**
 * Przebieg linii: oś (kropka + odcinek) | wybór przystanku | link do tablicy. Czysta prezentacja — dane i wybór
 * trzyma rodzic. Dwa osobne elementy interaktywne w wierszu (nigdy zagnieżdżone). GTFS: tylko „rozkład”, zero
 * opóźnień (#13); pojazd na osi to rzut pozycji na przebieg, nie ETA.
 */
export function LineRouteList({ city, stops, selectedStopId, selectedIndex: selectedRow, selectedBaseSec, onSelectStop, vehicles = NO_VEHICLES, mode, kind }: Props) {
  if (stops.length === 0) {
    return (
      <p role="status" className="text-sm text-text-secondary">
        Brak przebiegu tej linii.
      </p>
    )
  }

  // Paleta liczona raz. Czerń/granat (nocna/lokalna) giną na ciemnej karcie — jasny pierścień (ta sama reguła co plakietki).
  const palette = lineColor(mode, kind)
  const dotDarkRing = darkRingClass(kind) !== '' ? 'dark:ring-white/40' : 'dark:ring-slate-900'
  const selectedIndex = selectedRow ?? (selectedStopId === null ? -1 : stops.findIndex((s) => s.stopId === selectedStopId))

  return (
    <>
      <h2 className="text-sm font-bold text-foreground">
        Trasa linii · {stops.length} {pluralPl(stops.length, 'przystanek', 'przystanki', 'przystanków')}
      </h2>
      <ol className="mt-3">
        {stops.map((stop, index) => {
          const active = index === selectedIndex
          const first = index === 0
          const last = index === stops.length - 1
          const name = stopDisplayName(stop.name, stop.code)
          const passSec = selectedBaseSec !== null ? selectedBaseSec + stop.offsetSec : null
          const color = active ? 'var(--primary)' : 'var(--foreground)'
          return (
            // Klucz z indeksem: ten sam przystanek może wystąpić w przebiegu dwa razy.
            <li key={`${stop.stopId}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center pt-1.5">
                {first || last ? (
                  <span className="h-2.5 w-2.5 shrink-0" style={{ background: color }} aria-hidden="true" />
                ) : stop.onRequest ? (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-transparent" style={{ borderColor: color }} aria-hidden="true" />
                ) : (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                )}
                {!last && (
                  <span className="relative mt-1 w-0.5 flex-1 bg-surface-border">
                    {vehicles
                      .filter((v) => v.afterStopOrder === index)
                      .map((v) => (
                        <span
                          key={v.sideNumber + v.tripId}
                          data-testid="timeline-vehicle"
                          className={`absolute -left-[7px] grid h-4 w-4 place-items-center rounded-full text-white shadow ring-2 ring-white ${dotDarkRing}`}
                          style={{
                            top: `${v.fraction * 100}%`,
                            // Kolor rodzaju jak na mapie; strzałka = kierunek jazdy NA OSI (w dół listy), nie `v.bearing`.
                            backgroundColor: palette.bg,
                            color: palette.fg,
                            transform: 'translateY(-50%)',
                            // Żółte metro na białym pierścieniu jasnej karty znika — pierścień w kolorze obrysu z mapy.
                            ...(hasCustomStroke(palette.bg) ? ({ '--tw-ring-color': strokeFor(palette.bg) } as CSSProperties) : {}),
                          }}
                        >
                          <VehicleHeadingIcon className="h-2.5 w-2.5 rotate-180" />
                          <span className="sr-only">
                            Pojazd {v.sideNumber}
                            {v.ageSec > 60 ? `, ${formatAgo(v.ageSec)}` : ''}
                          </span>
                        </span>
                      ))}
                  </span>
                )}
              </div>

              <div className="mb-2 flex min-w-0 flex-1 items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onSelectStop(stop.stopId, index)}
                  aria-pressed={active}
                  // Wybór: obrys + pogrubienie + tło (nie sam kolor). Obrys jest zawsze, tylko przezroczysty — wtedy zanika płynnie (200 ms), bez pętli.
                  className={`press flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm outline-2 -outline-offset-2 transition-colors duration-[var(--duration-base)] focus-visible:outline-primary-text motion-reduce:transition-none max-sm:min-h-11 max-sm:items-center ${
                    active
                      ? 'bg-primary-soft font-semibold text-foreground outline-primary'
                      : 'text-text-secondary outline-transparent hover:text-foreground'
                  }`}
                >
                  <span className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${first || last ? 'font-semibold text-foreground' : ''}`}>
                    {name}
                    {stop.onRequest && (
                      <span className="ml-1.5 inline-block align-middle">
                        <OnRequestBadge />
                      </span>
                    )}
                    {(first || last) && (
                      <span className="ml-1.5 text-xs uppercase tracking-[0.08em] text-text-muted">{first ? 'początek' : 'koniec'}</span>
                    )}
                    {stop.street !== null && <span className="ml-2 text-xs text-text-muted">{stop.street}</span>}
                  </span>
                  {stop.wheelchair === 2 && (
                    <AccessibleIcon size={ICON_SIZE.chip} className="shrink-0 self-center text-warning-text" label="Przystanek niedostępny dla osób na wózku" />
                  )}
                  {passSec !== null ? (
                    <span className="shrink-0 font-semibold tabular-nums text-primary-text">{formatSecondsOfDay(passSec)}</span>
                  ) : (
                    index > 0 && <span className="shrink-0 text-xs tabular-nums text-text-muted">+{Math.round(stop.offsetSec / 60)} min</span>
                  )}
                </button>
                <Link
                  href={`/city/${city}/stop/${encodeStopIdForPathSegment(stop.stopId)}?name=${encodeURIComponent(stop.name)}`}
                  transitionTypes={NAV_FORWARD_TYPES}
                  aria-label={`Odjazdy z przystanku ${name}`}
                  className="press grid shrink-0 place-items-center rounded-lg px-2 text-text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary-text max-sm:min-h-11 max-sm:min-w-11"
                >
                  <ChevronRightIcon size={ICON_SIZE.button} />
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--foreground)' }} aria-hidden="true" /> przystanek
        </span>
        {stops.some((s) => s.onRequest) && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border-2 bg-transparent" style={{ borderColor: 'var(--foreground)' }} aria-hidden="true" /> na żądanie
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2" style={{ background: 'var(--foreground)' }} aria-hidden="true" /> przystanek krańcowy
        </span>
      </div>
    </>
  )
}
