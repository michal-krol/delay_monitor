'use client'

import Link from 'next/link'
import { ArrowRightIcon, ChevronRightIcon, SwapIcon } from '../icons'
import { AlertBanner } from '../AlertBanner'
import { LineBadge } from '../LineBadge'
import { OnRequestBadge } from '../OnRequestBadge'
import { MODE_LABEL } from '../transitMode'
import type { AlertRecord } from '@/lib/gtfs/alerts'
import type { LineDetail, LineListEntry, LineRouteStop } from '@/lib/gtfs/query'
import { PanelFrame } from './PanelFrame'
import { stopDisplayName } from '../stopName'

/**
 * Panel trybu linii (spec §6) — w tym samym dokowanym miejscu co karta obiektu.
 * Kierunek, liczba pojazdów w trasie, przystanki (klik = karta przystanku
 * i przelot). „×" kończy tryb linii. Trzy stany przebiegu (#7).
 */
export function LinePanel({
  line,
  detail,
  alerts = [],
  error,
  directionId,
  vehiclesOnLine,
  city,
  onDirection,
  onStop,
  onClose,
}: {
  line: LineListEntry
  /** `undefined` = wczytuje się, `null` = rozkład nie zna przebiegu tej linii. */
  detail: LineDetail | null | undefined
  /** Aktywne utrudnienia tej linii (`/api/gtfs/line`). */
  alerts?: AlertRecord[]
  error: boolean
  directionId: number
  vehiclesOnLine: number
  city: string
  onDirection: (directionId: number) => void
  onStop: (stop: LineRouteStop) => void
  onClose: () => void
}) {
  const directions = detail?.directions ?? []
  const direction = directions.find((d) => d.directionId === directionId) ?? directions[0]
  const other = directions.find((d) => d !== direction)

  return (
    <PanelFrame
      title={`Linia ${line.line}`}
      subtitle={<p className="mt-0.5 text-sm text-text-secondary first-letter:uppercase">{MODE_LABEL[line.mode]} · w trasie: {vehiclesOnLine}</p>}
      leading={<LineBadge line={line.line} mode={line.mode} kind={line.kind} />}
      closeLabel="Zakończ tryb linii"
      onClose={onClose}
      bodyLabel="Przystanki linii"
      focusKey={line.routeId}
    >
      {alerts.length > 0 && (
        <div className="mb-3">
          <AlertBanner alerts={alerts} />
        </div>
      )}
      {detail === undefined && error && <p className="text-sm text-error-text">Nie udało się pobrać przebiegu linii.</p>}
      {detail === undefined && !error && (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-7 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
          ))}
        </ul>
      )}
      {detail === null && <p className="text-sm text-text-secondary">Rozkład nie zna przebiegu tej linii.</p>}
      {direction !== undefined && (
        <>
          <div className="flex items-center gap-2">
            <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-sm font-semibold">
              {direction.origin ?? '—'} <ArrowRightIcon size={14} label="do" className="shrink-0 text-text-muted" /> {direction.headsign ?? '—'}
            </p>
            {other !== undefined && (
              <button
                type="button"
                onClick={() => onDirection(other.directionId)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-surface-border px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                <SwapIcon size={13} />
                Zmień kierunek
              </button>
            )}
          </div>
          <ol className="mt-3 space-y-0.5">
            {direction.stops.map((stop, index) => (
              <li key={`${stop.stopId}-${index}`}>
                <button
                  type="button"
                  onClick={() => onStop(stop)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-text-muted">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{stopDisplayName(stop.name, stop.code)}</span>
                  {stop.onRequest && <OnRequestBadge />}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <Link
        href={`/city/${city}/line/${line.routeId}`}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        style={{ background: 'var(--accent-gradient)' }}
      >
        Rozkład linii
        <ChevronRightIcon size={14} />
      </Link>
    </PanelFrame>
  )
}
