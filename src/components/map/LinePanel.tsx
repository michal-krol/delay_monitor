'use client'

import { useEffect, useId, useRef } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, CloseIcon, SwapIcon } from '../icons'
import { LineBadge } from '../LineBadge'
import { MODE_LABEL } from '../transitMode'
import type { LineDetail, LineListEntry, LineRouteStop } from '@/lib/gtfs/query'

/**
 * Panel trybu linii (spec §6) — w tym samym dokowanym miejscu co karta obiektu.
 * Kierunek, liczba pojazdów w trasie, przystanki (klik = karta przystanku
 * i przelot). „×" kończy tryb linii. Trzy stany przebiegu (#7).
 */
export function LinePanel({
  line,
  detail,
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
  error: boolean
  directionId: number
  vehiclesOnLine: number
  city: string
  onDirection: (directionId: number) => void
  onStop: (stop: LineRouteStop) => void
  onClose: () => void
}) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [line.routeId])

  const directions = detail?.directions ?? []
  const direction = directions.find((d) => d.directionId === directionId) ?? directions[0]
  const other = directions.find((d) => d !== direction)

  return (
    <section role="dialog" aria-modal="false" aria-labelledby={headingId} className="glass-strong flex max-h-full flex-col overflow-hidden rounded-2xl shadow-xl">
      <header className="flex items-start gap-3 border-b p-4" style={{ borderColor: 'var(--surface-border)' }}>
        <LineBadge line={line.line} color={line.color} mode={line.mode} />
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-heading text-lg font-bold leading-tight outline-none">
            Linia {line.line}
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary first-letter:uppercase">
            {MODE_LABEL[line.mode]} · w trasie: {vehiclesOnLine}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zakończ tryb linii"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <CloseIcon size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" tabIndex={0} aria-label="Przystanki linii">
        {detail === undefined && error && <p className="text-sm text-red-700 dark:text-red-300">Nie udało się pobrać przebiegu linii.</p>}
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
              <p className="min-w-0 flex-1 text-sm font-semibold">
                {direction.origin ?? '—'} → {direction.headsign ?? '—'}
              </p>
              {other !== undefined && (
                <button
                  type="button"
                  onClick={() => onDirection(other.directionId)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ borderColor: 'var(--surface-border)' }}
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
                    <span className="min-w-0 flex-1 truncate">{stop.name}</span>
                    {stop.onRequest && <span className="shrink-0 text-xs text-text-muted">na żądanie</span>}
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
          <ArrowRightIcon size={14} />
        </Link>
      </div>
    </section>
  )
}
