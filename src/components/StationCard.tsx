'use client'

import Link from 'next/link'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { ChevronRightIcon, ICON_SIZE } from './icons'
import { BoardRowList } from './BoardRowList'
import { PlaceTitle } from './PlaceTitle'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { formatClockTime } from '@/lib/format'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'

/** Ile kursów pokazuje karta Pulpitu — reszta jest na tablicy stacji. */
export const CARD_ROWS = 2

type Props = {
  stationId: string
  stationName: string
  snapshot: BoardApiSnapshot | null
  error: boolean
  configError: boolean
}

export function StationCard({ stationId, stationName, snapshot, error, configError }: Props) {
  const now = useSnapshotNow(snapshot)

  // Kafelek dashboardu pokazuje tylko nadchodzące połączenia — pociągi, które
  // już odjechały (mieszczące się w oknie 5 minut wstecz z transform.ts),
  // zostają wyłącznie w pełnej tablicy (FullBoard), gdzie są przygaszone.
  const departures = (snapshot?.departures.filter((row) => new Date(row.plannedAt).getTime() >= now) ?? []).slice(0, CARD_ROWS)

  if (configError) {
    return <ConfigErrorBanner />
  }

  // Nagłówek i wiersze to osobne, prawdziwe linki — żadnej nakładki na całą kartę (zagnieżdżone cele dotyku).
  return (
    <article className="glass card-press w-full rounded-2xl border border-surface-border p-5 max-sm:p-4">
      <PlaceTitle kind="pkp" id={stationId}>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          <Link
            href={`/station/${stationId}?name=${encodeURIComponent(stationName)}`}
            transitionTypes={NAV_FORWARD_TYPES}
            data-card-open
            className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <span className="min-w-0 truncate">{stationName}</span>
            <ChevronRightIcon size={ICON_SIZE.button} className="shrink-0 text-text-muted" />
          </Link>
        </h2>
      </PlaceTitle>

      {error && !snapshot && (
        <p aria-live="polite" className="mt-1 text-xs text-error-text">
          Nie udało się pobrać danych
        </p>
      )}
      {error && snapshot && (
        // Odświeżenie padło, ale ostatni dobry snapshot wciąż jest ważny —
        // czerwony błąd kłamałby, że dane zniknęły (#7: rosnący wiek danych,
        // nie pusty ekran).
        <p aria-live="polite" className="mt-1 text-xs text-text-muted">
          Nie udało się odświeżyć · dane z {formatClockTime(snapshot.fetchedAt)}
        </p>
      )}

      <BoardRowList
        rows={departures}
        now={now}
        loading={!snapshot && !error}
        showEmpty={snapshot !== null && departures.length === 0}
        emptyMessage="Brak odjazdów w najbliższych godzinach"
      />
    </article>
  )
}
